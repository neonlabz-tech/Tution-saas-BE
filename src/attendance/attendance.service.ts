import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AttendanceStatus, TxType } from '../enums/status.enum.js';
import {
  Transaction,
  type TransactionDocument,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import { BulkMarkUnmarkedDto } from './dto/bulk-mark-unmarked.dto.js';
import { DailyRosterQueryDto } from './dto/daily-roster.dto.js';
import { MarkManualAttendanceDto } from './dto/mark-manual-attendance.dto.js';
import { MarkQrAttendanceDto } from './dto/mark-qr-attendance.dto.js';
import { QueryAttendanceSummariesDto } from './dto/query-attendance-summaries.dto.js';
import { QueryAttendanceDto } from './dto/query-attendance.dto.js';
import { StudentHistoryQueryDto } from './dto/student-history-query.dto.js';
import { UpsertAttendanceDto } from './dto/upsert-attendance.dto.js';
import { VerifyQrDto } from './dto/verify-qr.dto.js';
import {
  AttendanceRecord,
  type AttendanceRecordDocument,
} from './schemas/attendance.schema.js';

export interface VerifyQrResponse {
  valid: boolean;
  message: string;
  student: {
    id: string;
    ref: string;
    fullName: string;
    email: string;
    phone: string;
    batch: string;
    status: string;
    moduleIds: string[];
    feeTotal: number;
    paidTotal: number;
    outstanding: number;
    paymentStatus: 'paid' | 'partial' | 'unpaid';
  };
  enrolledInModule?: boolean;
  alreadyMarked?: boolean;
  existingAttendance?: AttendanceRecord;
}

export interface MarkAttendanceResponse {
  success: boolean;
  message: string;
  isNew: boolean;
  record: AttendanceRecord;
  student: {
    id: string;
    fullName: string;
    batch: string;
  };
  module: {
    id: string;
    name: string;
    code: string;
  };
}

export interface AttendanceStatsResponse {
  date: string;
  moduleId: string;
  counts: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };
  rate: number;
  records: AttendanceRecord[];
}

export interface DailyRosterEntry {
  key: string;
  student: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    batch: string;
    status: string;
    avatar?: string;
  };
  module: {
    id: string;
    name: string;
    code: string;
  };
  record: AttendanceRecord | null;
}

export interface DailyRosterResponse {
  date: string;
  moduleId: string;
  batch: string;
  totalEntries: number;
  markedCount: number;
  unmarkedCount: number;
  counts: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
  rows: DailyRosterEntry[];
}

export interface StudentAttendanceSummary {
  student: {
    id: string;
    fullName: string;
    email: string;
    batch: string;
    status: string;
    phone?: string;
  };
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  rate: number;
}

export interface AttendanceSummariesResponse {
  from: string;
  to: string;
  moduleId: string;
  batch: string;
  totalStudents: number;
  overallCounts: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };
  overallRate: number;
  summaries: StudentAttendanceSummary[];
}

export interface StudentHistoryRecord extends AttendanceRecord {
  module?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface StudentHistoryResponse {
  student: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    batch: string;
    status: string;
    moduleIds: string[];
  };
  overallRate: number;
  counts: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };
  records: StudentHistoryRecord[];
}

export interface BulkMarkUnmarkedResponse {
  success: boolean;
  message: string;
  date: string;
  moduleId: string;
  batch: string;
  markedCount: number;
  records: AttendanceRecord[];
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
  ) {}

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeCode(code: string): string {
    return code
      .trim()
      .replace(/^eduflow:/i, '')
      .trim();
  }

  private getDefaultMonthRange(): { from: string; to: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return {
      from: `${y}-${m}-01`,
      to: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  async resolveStudent(code: string): Promise<Student> {
    const raw = code.trim();
    const clean = this.normalizeCode(code);
    if (!clean) {
      throw new BadRequestException('Student name, ID, or QR code cannot be empty');
    }

    const escapedClean = this.escapeRegex(clean);
    const escapedRaw = this.escapeRegex(raw);

    // 1. Try exact matches first: ref, exact ID, phone, email, or exact full name
    const exactStudent = await this.studentModel
      .findOne({
        $or: [
          { ref: clean },
          { id: new RegExp(`^${escapedClean}$`, 'i') },
          { id: new RegExp(`^${escapedRaw}$`, 'i') },
          { phone: clean },
          { email: clean.toLowerCase() },
          { fullName: new RegExp(`^${escapedClean}$`, 'i') },
        ],
      })
      .lean<Student>()
      .exec();

    if (exactStudent) {
      return exactStudent;
    }

    // 2. Partial name search requires at least 3 characters
    if (clean.length < 3) {
      throw new BadRequestException(
        'Please enter at least 3 characters to search by student name, or enter the full Student ID (STU-...).',
      );
    }

    // 3. For partial name search (>= 3 chars), search across students
    const partialMatches = await this.studentModel
      .find({ fullName: new RegExp(escapedClean, 'i') })
      .limit(6)
      .lean<Student[]>()
      .exec();

    if (partialMatches.length === 0) {
      throw new NotFoundException('No student matches the provided name, ID, or QR code');
    }

    if (partialMatches.length > 1) {
      const names = partialMatches.map((s) => `"${s.fullName}" (${s.id})`).join(', ');
      throw new BadRequestException(
        `Multiple students matched "${clean}": ${names}. Please type more characters or enter the exact Student ID.`,
      );
    }

    return partialMatches[0];
  }

  async verifyQr(dto: VerifyQrDto): Promise<VerifyQrResponse> {
    const student = await this.resolveStudent(dto.code);

    if (student.status === 'pending') {
      await this.studentModel.updateOne({ id: student.id }, { $set: { status: 'active' } });
      student.status = 'active';
    } else if (student.status !== 'active') {
      throw new BadRequestException(
        `Student "${student.fullName}" is marked as ${student.status}. Attendance can only be verified for active students.`,
      );
    }

    const paymentBalance = await this.computeStudentPaymentBalance(student);
    const today = dto.date ?? new Date().toISOString().slice(0, 10);
    let enrolledInModule: boolean | undefined = undefined;
    let alreadyMarked: boolean | undefined = undefined;
    let existingAttendance: AttendanceRecord | undefined = undefined;

    if (dto.moduleId) {
      const targetModule = await this.moduleModel
        .findOne({ id: dto.moduleId })
        .lean<CourseModule>()
        .exec();

      if (!targetModule) {
        throw new NotFoundException(`Module with ID "${dto.moduleId}" not found`);
      }

      enrolledInModule = student.moduleIds.includes(dto.moduleId);
      if (!enrolledInModule) {
        return {
          valid: false,
          message: `Student "${student.fullName}" is not enrolled in module "${targetModule.name}" (${targetModule.code})`,
          student: {
            id: student.id,
            ref: student.ref,
            fullName: student.fullName,
            email: student.email,
            phone: student.phone,
            batch: student.batch,
            status: student.status,
            moduleIds: student.moduleIds,
            ...paymentBalance,
          },
          enrolledInModule: false,
          alreadyMarked: false,
        };
      }

      const id = `att_${student.id}_${dto.moduleId}_${today}`;
      const record = await this.attendanceModel.findOne({ id }).lean<AttendanceRecord>().exec();
      alreadyMarked = !!record;
      existingAttendance = record ?? undefined;
    }

    return {
      valid: true,
      message: 'Student verified successfully',
      student: {
        id: student.id,
        ref: student.ref,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        batch: student.batch,
        status: student.status,
        moduleIds: student.moduleIds,
        ...paymentBalance,
      },
      enrolledInModule,
      alreadyMarked,
      existingAttendance,
    };
  }

  private async computeStudentPaymentBalance(
    student: Pick<Student, 'id' | 'moduleIds'>,
  ): Promise<{
    feeTotal: number;
    paidTotal: number;
    outstanding: number;
    paymentStatus: 'paid' | 'partial' | 'unpaid';
  }> {
    const [enrolledModules, tuitionTransactions] = await Promise.all([
      student.moduleIds?.length
        ? this.moduleModel
            .find({ id: { $in: student.moduleIds } })
            .select('fee')
            .lean<Array<Pick<CourseModule, 'fee'>>>()
            .exec()
        : Promise.resolve([]),
      this.transactionModel
        .find({
          studentId: student.id,
          type: TxType.INCOME,
          category: 'Tuition fees',
        })
        .select('amount')
        .lean<Array<Pick<Transaction, 'amount'>>>()
        .exec(),
    ]);

    const feeTotal = enrolledModules.reduce((sum, m) => sum + (m.fee ?? 0), 0);
    const paidTotal = tuitionTransactions.reduce(
      (sum, tx) => sum + (tx.amount ?? 0),
      0,
    );
    const outstanding = Math.max(0, feeTotal - paidTotal);
    const paymentStatus: 'paid' | 'partial' | 'unpaid' =
      outstanding <= 0 ? 'paid' : paidTotal > 0 ? 'partial' : 'unpaid';

    return {
      feeTotal,
      paidTotal,
      outstanding,
      paymentStatus,
    };
  }

  async markQrAttendance(dto: MarkQrAttendanceDto): Promise<MarkAttendanceResponse> {
    const student = await this.resolveStudent(dto.code);

    if (student.status === 'pending') {
      await this.studentModel.updateOne({ id: student.id }, { $set: { status: 'active' } });
      student.status = 'active';
    } else if (student.status !== 'active') {
      throw new BadRequestException(
        `Student "${student.fullName}" is marked as ${student.status}. Only active students can be marked present.`,
      );
    }

    const targetModule = await this.moduleModel
      .findOne({ id: dto.moduleId })
      .lean<CourseModule>()
      .exec();

    if (!targetModule) {
      throw new NotFoundException(`Module with ID "${dto.moduleId}" not found`);
    }

    if (!student.moduleIds.includes(dto.moduleId)) {
      throw new BadRequestException(
        `Student "${student.fullName}" (${student.id}) is not enrolled in module "${targetModule.name}" (${targetModule.code})`,
      );
    }

    const date = dto.date ?? new Date().toISOString().slice(0, 10);
    const status = dto.status ?? AttendanceStatus.PRESENT;
    const id = `att_${student.id}_${dto.moduleId}_${date}`;

    const existing = await this.attendanceModel.findOne({ id }).exec();
    let isNew = false;
    let saved: AttendanceRecord;

    if (existing) {
      existing.status = status;
      existing.method = 'qr';
      const doc = await existing.save();
      saved = typeof doc.toObject === 'function' ? doc.toObject() : (doc as unknown as AttendanceRecord);
    } else {
      isNew = true;
      const created = await this.attendanceModel.create({
        id,
        studentId: student.id,
        moduleId: dto.moduleId,
        date,
        status,
        method: 'qr',
      });
      saved = typeof created.toObject === 'function' ? created.toObject() : (created as unknown as AttendanceRecord);
    }

    return {
      success: true,
      message: `${student.fullName} marked ${status} in ${targetModule.code} via QR`,
      isNew,
      record: saved,
      student: {
        id: student.id,
        fullName: student.fullName,
        batch: student.batch,
      },
      module: {
        id: targetModule.id,
        name: targetModule.name,
        code: targetModule.code,
      },
    };
  }

  async upsertAttendance(dto: UpsertAttendanceDto): Promise<MarkAttendanceResponse> {
    const student = await this.resolveStudent(dto.studentId);

    if (student.status === 'pending') {
      await this.studentModel.updateOne({ id: student.id }, { $set: { status: 'active' } });
      student.status = 'active';
    } else if (student.status !== 'active') {
      throw new BadRequestException(
        `Student "${student.fullName}" is marked as ${student.status}. Attendance can only be updated for active students.`,
      );
    }

    const targetModule = await this.moduleModel
      .findOne({ id: dto.moduleId })
      .lean<CourseModule>()
      .exec();

    if (!targetModule) {
      throw new NotFoundException(`Module with ID "${dto.moduleId}" not found`);
    }

    if (!student.moduleIds.includes(dto.moduleId)) {
      throw new BadRequestException(
        `Student "${student.fullName}" is not enrolled in module "${targetModule.name}" (${targetModule.code})`,
      );
    }

    const date = dto.date ?? new Date().toISOString().slice(0, 10);
    const status = dto.status ?? AttendanceStatus.PRESENT;
    const method = dto.method ?? 'manual';
    const id = `att_${student.id}_${dto.moduleId}_${date}`;

    const existing = await this.attendanceModel.findOne({ id }).exec();
    let isNew = false;
    let saved: AttendanceRecord;

    if (existing) {
      existing.status = status;
      existing.method = method;
      if (dto.remarks !== undefined) {
        existing.remarks = dto.remarks;
      }
      const doc = await existing.save();
      saved = typeof doc.toObject === 'function' ? doc.toObject() : (doc as unknown as AttendanceRecord);
    } else {
      isNew = true;
      const created = await this.attendanceModel.create({
        id,
        studentId: student.id,
        moduleId: dto.moduleId,
        date,
        status,
        method,
        remarks: dto.remarks,
      });
      saved = typeof created.toObject === 'function' ? created.toObject() : (created as unknown as AttendanceRecord);
    }

    return {
      success: true,
      message: `${student.fullName} marked ${status} in ${targetModule.code} (${isNew ? 'new record' : 'record updated'})`,
      isNew,
      record: saved,
      student: {
        id: student.id,
        fullName: student.fullName,
        batch: student.batch,
      },
      module: {
        id: targetModule.id,
        name: targetModule.name,
        code: targetModule.code,
      },
    };
  }

  async markManualAttendance(
    dto: MarkManualAttendanceDto,
  ): Promise<MarkAttendanceResponse> {
    return this.upsertAttendance({
      studentId: dto.studentId,
      moduleId: dto.moduleId,
      date: dto.date,
      status: dto.status,
      method: dto.method,
    });
  }

  async getDailyRoster(query: DailyRosterQueryDto): Promise<DailyRosterResponse> {
    const date = query.date ?? new Date().toISOString().slice(0, 10);

    const studentFilter: Record<string, unknown> = {
      status: { $in: ['active', 'pending'] },
    };
    if (query.batch && query.batch !== 'all') {
      studentFilter.batch = query.batch;
    }
    if (query.studentId && query.studentId !== 'all') {
      studentFilter.id = query.studentId;
    }
    if (query.moduleId && query.moduleId !== 'all') {
      studentFilter.moduleIds = query.moduleId;
    }
    const searchTerm = (query.q || query.search)?.trim();
    let matchingModuleIds: string[] = [];
    if (searchTerm) {
      const escaped = this.escapeRegex(searchTerm);
      const matchedMods = await this.moduleModel
        .find({
          $or: [
            { name: new RegExp(escaped, 'i') },
            { code: new RegExp(escaped, 'i') },
            { id: new RegExp(escaped, 'i') },
          ],
        })
        .lean<CourseModule[]>()
        .exec();
      matchingModuleIds = matchedMods.map((m) => m.id);

      const orConditions: Array<Record<string, unknown>> = [
        { fullName: new RegExp(escaped, 'i') },
        { id: new RegExp(escaped, 'i') },
        { email: new RegExp(escaped, 'i') },
      ];
      if (matchingModuleIds.length > 0) {
        orConditions.push({ moduleIds: { $in: matchingModuleIds } });
      }
      studentFilter.$or = orConditions;
    }

    const students = await this.studentModel.find(studentFilter).lean<Student[]>().exec();

    const modules = await this.moduleModel.find({}).lean<CourseModule[]>().exec();
    const moduleMap = new Map<string, CourseModule>(modules.map((m) => [m.id, m]));

    const attFilter: Record<string, unknown> = { date };
    if (query.moduleId && query.moduleId !== 'all') {
      attFilter.moduleId = query.moduleId;
    }
    const records = await this.attendanceModel.find(attFilter).lean<AttendanceRecord[]>().exec();
    const recordMap = new Map<string, AttendanceRecord>(records.map((r) => [r.id, r]));

    const rows: DailyRosterEntry[] = [];
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    let markedCount = 0;

    for (const student of students) {
      for (const mid of student.moduleIds) {
        if (query.moduleId && query.moduleId !== 'all' && mid !== query.moduleId) {
          continue;
        }
        const mod = moduleMap.get(mid);
        if (!mod) {
          continue;
        }

        if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          const matchStudent =
            student.fullName?.toLowerCase().includes(lower) ||
            student.id?.toLowerCase().includes(lower) ||
            student.email?.toLowerCase().includes(lower) ||
            student.batch?.toLowerCase().includes(lower);
          const matchModule =
            mod.name?.toLowerCase().includes(lower) ||
            mod.code?.toLowerCase().includes(lower) ||
            mod.id?.toLowerCase().includes(lower);

          if (!matchStudent && !matchModule) {
            continue;
          }
        }
        const key = `att_${student.id}_${mid}_${date}`;
        const record = recordMap.get(key) ?? null;

        if (record) {
          markedCount++;
          if (record.status in counts) {
            counts[record.status as keyof typeof counts]++;
          }
        }

        rows.push({
          key,
          student: {
            id: student.id,
            fullName: student.fullName,
            email: student.email,
            phone: student.phone,
            batch: student.batch,
            status: student.status,
            avatar: (student as unknown as { avatar?: string }).avatar,
          },
          module: {
            id: mod.id,
            name: mod.name,
            code: mod.code,
          },
          record,
        });
      }
    }

    return {
      date,
      moduleId: query.moduleId ?? 'all',
      batch: query.batch ?? 'all',
      totalEntries: rows.length,
      markedCount,
      unmarkedCount: rows.length - markedCount,
      counts,
      rows,
    };
  }

  async bulkMarkUnmarked(dto: BulkMarkUnmarkedDto): Promise<BulkMarkUnmarkedResponse> {
    const date = dto.date ?? new Date().toISOString().slice(0, 10);
    const status = dto.status ?? AttendanceStatus.PRESENT;
    const method = dto.method ?? 'manual';

    const studentFilter: Record<string, unknown> = {
      status: { $in: ['active', 'pending'] },
    };
    if (dto.batch && dto.batch !== 'all') {
      studentFilter.batch = dto.batch;
    }
    if (dto.moduleId && dto.moduleId !== 'all') {
      studentFilter.moduleIds = dto.moduleId;
    }

    const students = await this.studentModel.find(studentFilter).lean<Student[]>().exec();

    const attFilter: Record<string, unknown> = { date };
    if (dto.moduleId && dto.moduleId !== 'all') {
      attFilter.moduleId = dto.moduleId;
    }

    const existing = await this.attendanceModel.find(attFilter, { id: 1 }).lean<AttendanceRecord[]>().exec();
    const existingIds = new Set(existing.map((e) => e.id));

    const toCreate: Array<{
      id: string;
      studentId: string;
      moduleId: string;
      date: string;
      status: AttendanceStatus;
      method: 'manual' | 'qr';
    }> = [];

    for (const student of students) {
      for (const mid of student.moduleIds) {
        if (dto.moduleId && dto.moduleId !== 'all' && mid !== dto.moduleId) {
          continue;
        }
        const key = `att_${student.id}_${mid}_${date}`;
        if (!existingIds.has(key)) {
          toCreate.push({
            id: key,
            studentId: student.id,
            moduleId: mid,
            date,
            status,
            method,
          });
        }
      }
    }

    let createdDocs: AttendanceRecord[] = [];
    if (toCreate.length > 0) {
      const inserted = await this.attendanceModel.insertMany(toCreate, { ordered: false });
      createdDocs = inserted.map((d) => (typeof d.toObject === 'function' ? d.toObject() : (d as unknown as AttendanceRecord)));
    }

    return {
      success: true,
      message: `${toCreate.length} unmarked student entries marked as ${status}`,
      date,
      moduleId: dto.moduleId ?? 'all',
      batch: dto.batch ?? 'all',
      markedCount: toCreate.length,
      records: createdDocs,
    };
  }

  async getSummaries(query: QueryAttendanceSummariesDto): Promise<AttendanceSummariesResponse> {
    const defaultRange = this.getDefaultMonthRange();
    const from = query.from ?? defaultRange.from;
    const to = query.to ?? defaultRange.to;

    const studentFilter: Record<string, unknown> = {};
    if (query.batch && query.batch !== 'all') {
      studentFilter.batch = query.batch;
    }
    if (query.studentId && query.studentId !== 'all') {
      studentFilter.id = query.studentId;
    }
    if (query.moduleId && query.moduleId !== 'all') {
      studentFilter.moduleIds = query.moduleId;
    }
    const searchTerm = (query.q || query.search)?.trim();
    let matchingModuleIds: string[] = [];
    if (searchTerm) {
      const escaped = this.escapeRegex(searchTerm);
      const matchedMods = await this.moduleModel
        .find({
          $or: [
            { name: new RegExp(escaped, 'i') },
            { code: new RegExp(escaped, 'i') },
            { id: new RegExp(escaped, 'i') },
          ],
        })
        .lean<CourseModule[]>()
        .exec();
      matchingModuleIds = matchedMods.map((m) => m.id);

      const orConditions: Array<Record<string, unknown>> = [
        { fullName: new RegExp(escaped, 'i') },
        { id: new RegExp(escaped, 'i') },
        { email: new RegExp(escaped, 'i') },
      ];
      if (matchingModuleIds.length > 0) {
        orConditions.push({ moduleIds: { $in: matchingModuleIds } });
      }
      studentFilter.$or = orConditions;
    }

    const students = await this.studentModel.find(studentFilter).lean<Student[]>().exec();

    const attFilter: Record<string, unknown> = {
      date: { $gte: from, $lte: to },
    };
    if (query.moduleId && query.moduleId !== 'all') {
      attFilter.moduleId = query.moduleId;
    }
    const studentIds = students.map((s) => s.id);
    attFilter.studentId = { $in: studentIds };

    const records = await this.attendanceModel.find(attFilter).lean<AttendanceRecord[]>().exec();

    const recMap = new Map<string, AttendanceRecord[]>();
    for (const r of records) {
      const list = recMap.get(r.studentId) ?? [];
      list.push(r);
      recMap.set(r.studentId, list);
    }

    const summaries: StudentAttendanceSummary[] = [];
    const overallCounts = { present: 0, absent: 0, late: 0, excused: 0, total: records.length };

    for (const s of students) {
      const list = recMap.get(s.id) ?? [];
      const c = { present: 0, absent: 0, late: 0, excused: 0, total: list.length };
      for (const r of list) {
        if (r.status in c) {
          c[r.status as keyof typeof c]++;
          overallCounts[r.status as keyof typeof c]++;
        }
      }
      const counted = c.total - c.excused;
      const attended = c.present + c.late;
      const rate = counted > 0 ? Math.round((attended / counted) * 1000) / 10 : 0;

      summaries.push({
        student: {
          id: s.id,
          fullName: s.fullName,
          email: s.email,
          batch: s.batch,
          status: s.status,
          phone: s.phone,
        },
        present: c.present,
        absent: c.absent,
        late: c.late,
        excused: c.excused,
        total: c.total,
        rate,
      });
    }

    const overallCounted = overallCounts.total - overallCounts.excused;
    const overallAttended = overallCounts.present + overallCounts.late;
    const overallRate = overallCounted > 0 ? Math.round((overallAttended / overallCounted) * 1000) / 10 : 0;

    return {
      from,
      to,
      moduleId: query.moduleId ?? 'all',
      batch: query.batch ?? 'all',
      totalStudents: summaries.length,
      overallCounts,
      overallRate,
      summaries,
    };
  }

  async getStudentHistory(
    studentId: string,
    query?: StudentHistoryQueryDto,
  ): Promise<StudentHistoryResponse> {
    const student = await this.resolveStudent(studentId);

    const filter: Record<string, unknown> = { studentId: student.id };
    if (query?.moduleId && query.moduleId !== 'all') {
      filter.moduleId = query.moduleId;
    }
    if (query?.from || query?.to) {
      const dateFilter: Record<string, string> = {};
      if (query.from) dateFilter.$gte = query.from;
      if (query.to) dateFilter.$lte = query.to;
      filter.date = dateFilter;
    }

    const limit = query?.limit ?? 100;
    const records = await this.attendanceModel
      .find(filter)
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .lean<AttendanceRecord[]>()
      .exec();

    const moduleIds = [...new Set(records.map((r) => r.moduleId))];
    const modules = await this.moduleModel
      .find({ id: { $in: moduleIds } })
      .lean<CourseModule[]>()
      .exec();
    const modMap = new Map(modules.map((m) => [m.id, m]));

    const counts = { present: 0, absent: 0, late: 0, excused: 0, total: records.length };
    const populatedRecords: StudentHistoryRecord[] = records.map((r) => {
      if (r.status in counts) {
        counts[r.status as keyof typeof counts]++;
      }
      const m = modMap.get(r.moduleId);
      return {
        ...r,
        module: m ? { id: m.id, name: m.name, code: m.code } : undefined,
      };
    });

    const counted = counts.total - counts.excused;
    const attended = counts.present + counts.late;
    const overallRate = counted > 0 ? Math.round((attended / counted) * 1000) / 10 : 0;

    return {
      student: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        batch: student.batch,
        status: student.status,
        moduleIds: student.moduleIds,
      },
      overallRate,
      counts,
      records: populatedRecords,
    };
  }

  async findAll(query: QueryAttendanceDto): Promise<AttendanceRecord[]> {
    const filter: Record<string, unknown> = {};
    if (query.studentId) filter.studentId = query.studentId;
    if (query.moduleId && query.moduleId !== 'all') filter.moduleId = query.moduleId;
    if (query.status) filter.status = query.status;
    if (query.method) filter.method = query.method;

    if (query.date) {
      filter.date = query.date;
    } else if (query.from || query.to) {
      const dateFilter: Record<string, string> = {};
      if (query.from) dateFilter.$gte = query.from;
      if (query.to) dateFilter.$lte = query.to;
      filter.date = dateFilter;
    }

    return this.attendanceModel
      .find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean<AttendanceRecord[]>()
      .exec();
  }

  async findById(id: string): Promise<AttendanceRecord> {
    const record = await this.attendanceModel.findOne({ id }).lean<AttendanceRecord>().exec();
    if (!record) {
      throw new NotFoundException(`Attendance record "${id}" not found`);
    }
    return record;
  }

  async getStats(date?: string, moduleId?: string): Promise<AttendanceStatsResponse> {
    const today = date ?? new Date().toISOString().slice(0, 10);
    const filter: Record<string, unknown> = { date: today };
    if (moduleId && moduleId !== 'all') filter.moduleId = moduleId;

    const records = await this.attendanceModel
      .find(filter)
      .lean<AttendanceRecord[]>()
      .exec();

    const counts = {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      total: records.length,
    };

    for (const r of records) {
      if (r.status in counts) {
        counts[r.status as keyof typeof counts]++;
      }
    }

    const counted = records.filter((r) => r.status !== AttendanceStatus.EXCUSED).length;
    const attended = counts.present + counts.late;
    const rate = counted > 0 ? Math.round((attended / counted) * 1000) / 10 : 0;

    return {
      date: today,
      moduleId: moduleId ?? 'all',
      counts,
      rate,
      records,
    };
  }

  async delete(id: string): Promise<{ deleted: true; id: string }> {
    const res = await this.attendanceModel.deleteOne({ id }).exec();
    if (res.deletedCount === 0) {
      throw new NotFoundException(`Attendance record "${id}" not found`);
    }
    return { deleted: true, id };
  }
}
