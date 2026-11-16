import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AttendanceStatus } from '../enums/status.enum.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import { MarkManualAttendanceDto } from './dto/mark-manual-attendance.dto.js';
import { MarkQrAttendanceDto } from './dto/mark-qr-attendance.dto.js';
import { QueryAttendanceDto } from './dto/query-attendance.dto.js';
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

  async resolveStudent(code: string): Promise<Student> {
    const raw = code.trim();
    const clean = this.normalizeCode(code);
    if (!clean) {
      throw new BadRequestException('QR code cannot be empty');
    }

    const student = await this.studentModel
      .findOne({
        $or: [
          { ref: clean },
          { id: new RegExp(`^${this.escapeRegex(clean)}$`, 'i') },
          { id: new RegExp(`^${this.escapeRegex(raw)}$`, 'i') },
        ],
      })
      .lean<Student>()
      .exec();

    if (!student) {
      throw new NotFoundException('No student matches the scanned QR code or ID');
    }

    return student;
  }

  async verifyQr(dto: VerifyQrDto): Promise<VerifyQrResponse> {
    const student = await this.resolveStudent(dto.code);

    if (student.status !== 'active') {
      throw new BadRequestException(
        `Student "${student.fullName}" is marked as ${student.status}. Attendance can only be verified for active students.`,
      );
    }

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
          message: `Student "${student.fullName}" (${student.id}) is not enrolled in module "${targetModule.name}" (${targetModule.code})`,
          student: {
            id: student.id,
            ref: student.ref,
            fullName: student.fullName,
            email: student.email,
            phone: student.phone,
            batch: student.batch,
            status: student.status,
            moduleIds: student.moduleIds,
          },
          enrolledInModule: false,
        };
      }

      const existing = await this.attendanceModel
        .findOne({
          studentId: student.id,
          moduleId: dto.moduleId,
          date: today,
        })
        .lean<AttendanceRecord>()
        .exec();

      if (existing) {
        alreadyMarked = true;
        existingAttendance = existing;
      } else {
        alreadyMarked = false;
      }
    }

    return {
      valid: true,
      message: alreadyMarked
        ? `Student "${student.fullName}" has already been marked ${existingAttendance?.status} today`
        : `Student "${student.fullName}" verified successfully`,
      student: {
        id: student.id,
        ref: student.ref,
        fullName: student.fullName,
        email: student.email,
        phone: student.phone,
        batch: student.batch,
        status: student.status,
        moduleIds: student.moduleIds,
      },
      enrolledInModule,
      alreadyMarked,
      existingAttendance,
    };
  }

  async markQrAttendance(dto: MarkQrAttendanceDto): Promise<MarkAttendanceResponse> {
    const student = await this.resolveStudent(dto.code);

    if (student.status !== 'active') {
      throw new BadRequestException(
        `Cannot record attendance: Student "${student.fullName}" is ${student.status}.`,
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

  async markManualAttendance(
    dto: MarkManualAttendanceDto,
  ): Promise<MarkAttendanceResponse> {
    const student = await this.studentModel
      .findOne({ id: dto.studentId })
      .lean<Student>()
      .exec();

    if (!student) {
      throw new NotFoundException(`Student with ID "${dto.studentId}" not found`);
    }

    const targetModule = await this.moduleModel
      .findOne({ id: dto.moduleId })
      .lean<CourseModule>()
      .exec();

    if (!targetModule) {
      throw new NotFoundException(`Module with ID "${dto.moduleId}" not found`);
    }

    const id = `att_${student.id}_${dto.moduleId}_${dto.date}`;
    const existing = await this.attendanceModel.findOne({ id }).exec();
    let isNew = false;
    let saved: AttendanceRecord;

    if (existing) {
      existing.status = dto.status;
      existing.method = dto.method ?? 'manual';
      const doc = await existing.save();
      saved = typeof doc.toObject === 'function' ? doc.toObject() : (doc as unknown as AttendanceRecord);
    } else {
      isNew = true;
      const created = await this.attendanceModel.create({
        id,
        studentId: student.id,
        moduleId: dto.moduleId,
        date: dto.date,
        status: dto.status,
        method: dto.method ?? 'manual',
      });
      saved = typeof created.toObject === 'function' ? created.toObject() : (created as unknown as AttendanceRecord);
    }

    return {
      success: true,
      message: `${student.fullName} marked ${dto.status} in ${targetModule.code}`,
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
