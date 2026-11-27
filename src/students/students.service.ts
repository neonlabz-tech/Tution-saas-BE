import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type Connection, type Model, Types } from 'mongoose';
import {
  AttendanceRecord,
  type AttendanceRecordDocument,
} from '../attendance/schemas/attendance.schema.js';
import { Role } from '../enums/role.enum.js';
import { AttendanceStatus, TxType } from '../enums/status.enum.js';
import {
  Transaction,
  type TransactionDocument,
} from '../finance/schemas/transaction.schema.js';
import { MailService } from '../mail/mail.service.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import type { CreateStudentDto } from './dto/create-student.dto.js';
import type { StudentQueryDto } from './dto/student-query.dto.js';
import type { UpdateStudentDto } from './dto/update-student.dto.js';
import { StudentRegisteredEvent } from './events/student-registered.event.js';
import { Counter, type CounterDocument } from './schemas/counter.schema.js';
import {
  Student,
  type StudentDocument,
  type StudentStatus,
} from './schemas/student.schema.js';

const REF_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
const REF_LENGTH = 16;

export interface PopulatedStudentModule {
  id: string;
  code: string;
  name: string;
  fee: number;
}

export interface StudentListItem {
  id: string;
  ref: string;
  fullName: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  guardianName: string;
  guardianPhone: string;
  batch: string;
  moduleIds: string[];
  modules: PopulatedStudentModule[];
  enrollmentDate: string;
  status: StudentStatus;
  feeTotal: number;
  paidTotal: number;
  outstanding: number;
}

export interface StudentDetailResponse extends StudentListItem {
  qrRotatedAt: Date | null;
  qrPayload: string;
  attendanceSummary: {
    rate: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
  };
  attendanceRecords: Array<{
    id: string;
    studentId: string;
    moduleId: string;
    moduleName: string;
    date: string;
    status: string;
    method: string;
  }>;
  payments: Array<{
    id: string;
    type: string;
    category: string;
    amount: number;
    date: string;
    description?: string;
    studentId?: string;
    method?: string;
  }>;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,

    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,

    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,

    @InjectConnection()
    private readonly connection: Connection,

    private readonly eventEmitter: EventEmitter2,
    private readonly mailService: MailService,
  ) {}

  async findAll(query: StudentQueryDto) {
    const filter: Record<string, unknown> = {};

    if (query.q) {
      const regex = new RegExp(this.escapeRegex(query.q), 'i');
      filter.$or = [{ fullName: regex }, { id: regex }, { email: regex }];
    }

    if (query.batch) {
      filter.batch = query.batch;
    }

    if (query.moduleId) {
      filter.moduleIds = query.moduleId;
    }

    if (query.status) {
      filter.status = query.status;
    }

    const { page, limit, sortBy, sortOrder } = query;
    const sortDirection = sortOrder === 'asc' ? 1 : -1;

    const [totalAll, activeCount, filteredTotal] = await Promise.all([
      this.studentModel.countDocuments({}),
      this.studentModel.countDocuments({ status: 'active' }),
      this.studentModel.countDocuments(filter),
    ]);

    let items: StudentListItem[];

    if (
      sortBy === 'outstanding' ||
      sortBy === 'feeTotal' ||
      sortBy === 'paidTotal'
    ) {
      const matchingStudents = await this.studentModel.find(filter).lean();
      const enriched = await this.enrichStudentList(matchingStudents);
      enriched.sort((a, b) =>
        sortOrder === 'asc' ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy],
      );
      items = enriched.slice((page - 1) * limit, page * limit);
    } else {
      const pagedStudents = await this.studentModel
        .find(filter)
        .sort({ [sortBy]: sortDirection })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      items = await this.enrichStudentList(pagedStudents);
    }

    return {
      items,
      pagination: {
        total: filteredTotal,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(filteredTotal / limit)),
      },
      summary: {
        total: totalAll,
        filteredTotal,
        activeCount,
      },
    };
  }

  async findOne(id: string): Promise<StudentDetailResponse> {
    const student = await this.studentModel
      .findOne(this.buildStudentIdFilter(id))
      .lean();

    if (!student) {
      throw new NotFoundException(`Student "${id}" not found`);
    }

    return this.buildStudentDetail(student);
  }

  async lookupByCode(code: string): Promise<StudentDetailResponse> {
    const normalized = code
      .trim()
      .replace(/^eduflow:/i, '')
      .trim();

    if (!normalized) {
      throw new BadRequestException('Invalid lookup code');
    }

    const student = await this.studentModel
      .findOne({
        $or: [
          { ref: normalized },
          { id: new RegExp(`^${this.escapeRegex(normalized)}$`, 'i') },
          { email: new RegExp(`^${this.escapeRegex(normalized)}$`, 'i') },
        ],
      })
      .lean();

    if (!student) {
      throw new NotFoundException(
        'This code does not match any student record.',
      );
    }

    return this.buildStudentDetail(student);
  }

  async create(dto: CreateStudentDto) {
    const email = dto.email.trim().toLowerCase();

    const existingEmail = await this.studentModel.findOne({ email }).lean();
    if (existingEmail) {
      throw new ConflictException(
        'A student with this email address already exists',
      );
    }

    const modules = await this.validateAndResolveModules(dto.moduleIds);

    const year = new Date().getFullYear();
    const id = await this.generateNextStudentId(year);

    let createdStudent: Student | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const ref = await this.generateUniqueRef();
      try {
        const doc = await this.studentModel.create({
          id,
          ref,
          fullName: dto.fullName,
          email,
          phone: dto.phone,
          dob: dto.dob,
          address: dto.address,
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          batch: dto.batch,
          moduleIds: dto.moduleIds,
          enrollmentDate: dto.enrollmentDate,
          status: dto.status,
        });
        createdStudent = doc.toObject();
        break;
      } catch (error) {
        if (this.isDuplicateKeyError(error, 'email')) {
          throw new ConflictException(
            'A student with this email address already exists',
          );
        }
        if (this.isDuplicateKeyError(error, 'ref') && attempt < 4) {
          continue;
        }
        throw error;
      }
    }

    if (!createdStudent) {
      throw new InternalServerErrorException(
        'Failed to generate a unique student QR reference',
      );
    }

    // Auto-generate or use provided password for student login account
    const isSelfRegistered = Boolean(dto.isSelfRegistered);
    const generatedPassword =
      dto.password?.trim() || `Stu@${randomInt(100000, 999999)}`;
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    if (typeof this.userModel?.findOne === 'function') {
      const existingUser = await this.userModel.findOne({ email }).exec();
      if (!existingUser) {
        const studentUserId = await this.generateNextStudentUserId();
        await this.userModel.create({
          id: studentUserId,
          fullName: createdStudent.fullName,
          email: createdStudent.email,
          passwordHash,
          role: Role.STUDENT,
          isActive: createdStudent.status !== 'pending',
          studentId: createdStudent.id,
          mustChangePassword: !isSelfRegistered,
          lastLoginAt: null,
        });
      } else if (!existingUser.studentId) {
        existingUser.studentId = createdStudent.id;
        existingUser.passwordHash = passwordHash;
        existingUser.mustChangePassword = !isSelfRegistered;
        if (createdStudent.status !== 'pending') {
          existingUser.isActive = true;
        }
        await existingUser.save();
      }
    }

    this.eventEmitter.emit(
      'student.registered',
      new StudentRegisteredEvent(
        createdStudent.id,
        createdStudent.ref,
        createdStudent.fullName,
        createdStudent.email,
        createdStudent.batch,
        createdStudent.status,
        createdStudent.enrollmentDate,
        modules.map((m) => ({ id: m.id, code: m.code, name: m.name })),
        isSelfRegistered ? undefined : generatedPassword,
        isSelfRegistered,
      ),
    );

    const feeTotal = modules.reduce((sum, m) => sum + m.fee, 0);

    return {
      ...this.pickStudentProfile(createdStudent),
      modules,
      feeTotal,
      paidTotal: 0,
      outstanding: feeTotal,
      qrPayload: `EDUFLOW:${createdStudent.ref}`,
      generatedPassword,
    };
  }

  async update(id: string, dto: UpdateStudentDto) {
    const existing = await this.studentModel
      .findOne(this.buildStudentIdFilter(id))
      .lean();

    if (!existing) {
      throw new NotFoundException(`Student "${id}" not found`);
    }

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email) {
        const duplicate = await this.studentModel
          .findOne({
            email: normalizedEmail,
            _id: { $ne: existing._id },
          })
          .lean();
        if (duplicate) {
          throw new ConflictException(
            'A student with this email address already exists',
          );
        }
      }
    }

    if (dto.moduleIds) {
      await this.validateAndResolveModules(dto.moduleIds);
    }

    const updateFields: Record<string, unknown> = {};
    if (dto.fullName !== undefined) updateFields.fullName = dto.fullName;
    if (dto.email !== undefined) {
      updateFields.email = dto.email.trim().toLowerCase();
    }
    if (dto.phone !== undefined) updateFields.phone = dto.phone;
    if (dto.dob !== undefined) updateFields.dob = dto.dob;
    if (dto.address !== undefined) updateFields.address = dto.address;
    if (dto.guardianName !== undefined) {
      updateFields.guardianName = dto.guardianName;
    }
    if (dto.guardianPhone !== undefined) {
      updateFields.guardianPhone = dto.guardianPhone;
    }
    if (dto.batch !== undefined) updateFields.batch = dto.batch;
    if (dto.moduleIds !== undefined) updateFields.moduleIds = dto.moduleIds;
    if (dto.enrollmentDate !== undefined) {
      updateFields.enrollmentDate = dto.enrollmentDate;
    }
    if (dto.status !== undefined) updateFields.status = dto.status;

    if (Object.keys(updateFields).length === 0) {
      return this.findOne(existing.id);
    }

    try {
      const updated = await this.studentModel
        .findOneAndUpdate(
          { _id: existing._id },
          { $set: updateFields },
          { returnDocument: 'after' },
        )
        .lean();

      if (!updated) {
        throw new NotFoundException(`Student "${id}" not found`);
      }

      // Sync active state or email change to user credentials
      if (dto.status !== undefined || dto.email !== undefined) {
        const userUpdates: Record<string, unknown> = {};
        if (dto.status !== undefined) {
          userUpdates.isActive = dto.status === 'active';
        }
        if (dto.email !== undefined) {
          userUpdates.email = updateFields.email;
        }
        if (typeof this.userModel?.updateMany === 'function') {
          await this.userModel.updateMany(
            {
              $or: [
                { studentId: existing.id },
                { email: existing.email, role: Role.STUDENT },
              ],
            },
            { $set: userUpdates },
          );
        }
      }

      return this.buildStudentDetail(updated);
    } catch (error) {
      if (this.isDuplicateKeyError(error, 'email')) {
        throw new ConflictException(
          'A student with this email address already exists',
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    const existing = await this.studentModel
      .findOne(this.buildStudentIdFilter(id))
      .lean();

    if (!existing) {
      throw new NotFoundException(`Student "${id}" not found`);
    }

    let deletedAttendanceCount = 0;
    let deletedUserCount = 0;

    if (typeof this.connection?.startSession === 'function') {
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          await this.studentModel.deleteOne({ _id: existing._id }, { session });
          const attendanceRes = await this.attendanceModel.deleteMany(
            { studentId: existing.id },
            { session },
          );
          deletedAttendanceCount = attendanceRes.deletedCount ?? 0;

          if (typeof this.userModel?.deleteMany === 'function') {
            const userRes = await this.userModel.deleteMany(
              {
                $or: [
                  { studentId: existing.id },
                  { email: existing.email, role: Role.STUDENT },
                ],
              },
              { session },
            );
            deletedUserCount = userRes.deletedCount ?? 0;
          }
        });
      } finally {
        await session.endSession();
      }
    } else {
      await this.studentModel.deleteOne({ _id: existing._id });
      const attendanceRes = await this.attendanceModel.deleteMany({
        studentId: existing.id,
      });
      deletedAttendanceCount = attendanceRes.deletedCount ?? 0;

      if (typeof this.userModel?.deleteMany === 'function') {
        const userRes = await this.userModel.deleteMany({
          $or: [
            { studentId: existing.id },
            { email: existing.email, role: Role.STUDENT },
          ],
        });
        deletedUserCount = userRes.deletedCount ?? 0;
      }
    }

    return {
      deleted: true,
      id: existing.id,
      deletedAttendanceCount,
      deletedUserCount,
    };
  }

  async rotateQr(id: string) {
    const existing = await this.studentModel
      .findOne(this.buildStudentIdFilter(id))
      .lean();

    if (!existing) {
      throw new NotFoundException(`Student "${id}" not found`);
    }

    const rotatedAt = new Date();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextRef = await this.generateUniqueRef();
      try {
        const updated = await this.studentModel
          .findOneAndUpdate(
            { _id: existing._id },
            { $set: { ref: nextRef, qrRotatedAt: rotatedAt } },
            { returnDocument: 'after' },
          )
          .lean();

        if (!updated) {
          throw new NotFoundException(`Student "${id}" not found`);
        }

        return {
          id: updated.id,
          ref: updated.ref,
          qrPayload: `EDUFLOW:${updated.ref}`,
          rotatedAt: updated.qrRotatedAt ?? rotatedAt,
          qrRotatedAt: updated.qrRotatedAt ?? rotatedAt,
        };
      } catch (error) {
        if (this.isDuplicateKeyError(error, 'ref') && attempt < 4) {
          continue;
        }
        throw error;
      }
    }

    throw new InternalServerErrorException(
      'Failed to rotate QR reference uniquely',
    );
  }

  private async enrichStudentList(
    students: Student[],
  ): Promise<StudentListItem[]> {
    if (students.length === 0) {
      return [];
    }

    const allModuleIds = Array.from(
      new Set(students.flatMap((s) => s.moduleIds ?? [])),
    );
    const studentIds = students.map((s) => s.id);

    const [modules, tuitionTransactions] = await Promise.all([
      allModuleIds.length > 0
        ? this.moduleModel
            .find({ id: { $in: allModuleIds } })
            .select('id code name fee')
            .lean()
        : Promise.resolve([]),
      this.transactionModel
        .find({
          type: TxType.INCOME,
          category: 'Tuition fees',
          studentId: { $in: studentIds },
        })
        .select('studentId amount')
        .lean(),
    ]);

    const moduleMap = new Map<string, PopulatedStudentModule>();
    for (const mod of modules) {
      moduleMap.set(mod.id, {
        id: mod.id,
        code: mod.code,
        name: mod.name,
        fee: mod.fee,
      });
    }

    const paidMap = new Map<string, number>();
    for (const tx of tuitionTransactions) {
      if (tx.studentId) {
        paidMap.set(tx.studentId, (paidMap.get(tx.studentId) ?? 0) + tx.amount);
      }
    }

    return students.map((student) => {
      const populatedModules = (student.moduleIds ?? [])
        .map((modId) => moduleMap.get(modId))
        .filter((mod): mod is PopulatedStudentModule => Boolean(mod));

      const feeTotal = populatedModules.reduce((sum, mod) => sum + mod.fee, 0);
      const paidTotal = paidMap.get(student.id) ?? 0;
      const outstanding = Math.max(0, feeTotal - paidTotal);

      return {
        ...this.pickStudentProfile(student),
        modules: populatedModules,
        feeTotal,
        paidTotal,
        outstanding,
      };
    });
  }

  private async buildStudentDetail(
    student: Student,
  ): Promise<StudentDetailResponse> {
    const [studentModules, attendanceDocs, paymentDocs] = await Promise.all([
      student.moduleIds?.length
        ? this.moduleModel
            .find({ id: { $in: student.moduleIds } })
            .select('id code name fee')
            .lean()
        : Promise.resolve([]),
      this.attendanceModel
        .find({ studentId: student.id })
        .sort({ date: -1, createdAt: -1 })
        .lean(),
      this.transactionModel
        .find({ studentId: student.id })
        .sort({ date: -1, createdAt: -1 })
        .lean(),
    ]);

    const moduleMap = new Map<string, PopulatedStudentModule>();
    for (const mod of studentModules) {
      moduleMap.set(mod.id, {
        id: mod.id,
        code: mod.code,
        name: mod.name,
        fee: mod.fee,
      });
    }

    const extraAttendanceModuleIds = Array.from(
      new Set(
        attendanceDocs
          .map((record) => record.moduleId)
          .filter((modId) => !moduleMap.has(modId)),
      ),
    );

    if (extraAttendanceModuleIds.length > 0) {
      const extraModules = await this.moduleModel
        .find({ id: { $in: extraAttendanceModuleIds } })
        .select('id code name fee')
        .lean();
      for (const mod of extraModules) {
        moduleMap.set(mod.id, {
          id: mod.id,
          code: mod.code,
          name: mod.name,
          fee: mod.fee,
        });
      }
    }

    const populatedModules = (student.moduleIds ?? [])
      .map((modId) => moduleMap.get(modId))
      .filter((mod): mod is PopulatedStudentModule => Boolean(mod));

    const feeTotal = populatedModules.reduce((sum, mod) => sum + mod.fee, 0);
    const paidTotal = paymentDocs
      .filter((tx) => tx.type === TxType.INCOME && tx.category === 'Tuition fees')
      .reduce((sum, tx) => sum + tx.amount, 0);
    const outstanding = Math.max(0, feeTotal - paidTotal);

    let present = 0;
    let late = 0;
    let absent = 0;
    let excused = 0;

    for (const record of attendanceDocs) {
      if (record.status === AttendanceStatus.PRESENT) present += 1;
      else if (record.status === AttendanceStatus.LATE) late += 1;
      else if (record.status === AttendanceStatus.ABSENT) absent += 1;
      else if (record.status === AttendanceStatus.EXCUSED) excused += 1;
    }

    const nonExcusedCount = present + late + absent;
    const rate =
      nonExcusedCount === 0
        ? 0
        : Math.round(((present + late) / nonExcusedCount) * 1000) / 10;

    const attendanceRecords = attendanceDocs.slice(0, 50).map((record) => ({
      id: record.id,
      studentId: record.studentId,
      moduleId: record.moduleId,
      moduleName: moduleMap.get(record.moduleId)?.name ?? record.moduleId,
      date: record.date,
      status: record.status,
      method: record.method ?? 'manual',
    }));

    const payments = paymentDocs.map((tx) => ({
      id: tx.id,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      date: tx.date,
      description: tx.description,
      studentId: tx.studentId,
      method: tx.method,
    }));

    return {
      ...this.pickStudentProfile(student),
      qrRotatedAt: student.qrRotatedAt ?? null,
      qrPayload: `EDUFLOW:${student.ref}`,
      modules: populatedModules,
      feeTotal,
      paidTotal,
      outstanding,
      attendanceSummary: {
        rate,
        present,
        late,
        absent,
        excused,
      },
      attendanceRecords,
      payments,
    };
  }

  private async validateAndResolveModules(
    moduleIds: string[],
  ): Promise<PopulatedStudentModule[]> {
    const foundModules = await this.moduleModel
      .find({ id: { $in: moduleIds } })
      .select('id code name fee')
      .lean();

    const moduleMap = new Map<string, PopulatedStudentModule>();
    for (const mod of foundModules) {
      moduleMap.set(mod.id, {
        id: mod.id,
        code: mod.code,
        name: mod.name,
        fee: mod.fee,
      });
    }

    const missingIds = moduleIds.filter((id) => !moduleMap.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(
        `Invalid module ID(s): ${missingIds.join(', ')}`,
      );
    }

    return moduleIds.map((id) => moduleMap.get(id)!);
  }

  private async generateNextStudentId(year: number): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: `student:${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean();

    const seq = counter?.seq ?? 1;
    return `STU-${year}-${String(seq).padStart(3, '0')}`;
  }

  private async generateUniqueRef(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = this.generateOpaqueToken();
      const exists = await this.studentModel.exists({ ref: candidate });
      if (!exists) {
        return candidate;
      }
    }

    throw new InternalServerErrorException(
      'Unable to allocate a unique QR reference',
    );
  }

  private generateOpaqueToken(): string {
    let token = '';
    for (let i = 0; i < REF_LENGTH; i += 1) {
      token += REF_ALPHABET[randomInt(0, REF_ALPHABET.length)];
    }
    return token;
  }

  private buildStudentIdFilter(idOrObjectId: string): Record<string, unknown> {
    const trimmed = idOrObjectId.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed) && Types.ObjectId.isValid(trimmed)) {
      return { $or: [{ id: trimmed }, { _id: new Types.ObjectId(trimmed) }] };
    }
    return { id: trimmed };
  }

  private pickStudentProfile(student: Student) {
    return {
      id: student.id,
      ref: student.ref,
      fullName: student.fullName,
      email: student.email,
      phone: student.phone,
      dob: student.dob,
      address: student.address,
      guardianName: student.guardianName,
      guardianPhone: student.guardianPhone,
      batch: student.batch,
      moduleIds: student.moduleIds ?? [],
      enrollmentDate: student.enrollmentDate,
      status: student.status,
    };
  }

  async moveStudentsToBatch(
    studentIds: string[],
    targetBatch: string,
  ): Promise<{ success: boolean; updatedCount: number; targetBatch: string }> {
    const cleanIds = (studentIds || []).filter(Boolean);
    const cleanBatch = (targetBatch || '').trim();

    if (cleanIds.length === 0 || !cleanBatch) {
      throw new BadRequestException('Student IDs and target batch are required');
    }

    const orClauses: Array<Record<string, unknown>> = [{ id: { $in: cleanIds } }];
    const validObjectIds = cleanIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (validObjectIds.length > 0) {
      orClauses.push({ _id: { $in: validObjectIds } });
    }

    const res = await this.studentModel
      .updateMany({ $or: orClauses }, { $set: { batch: cleanBatch } })
      .exec();

    return {
      success: true,
      updatedCount: res.modifiedCount,
      targetBatch: cleanBatch,
    };
  }

  async verifyStudent(id: string) {
    const student = await this.studentModel
      .findOne(this.buildStudentIdFilter(id))
      .exec();

    if (!student) {
      throw new NotFoundException(`Student "${id}" not found`);
    }

    student.status = 'active';
    await student.save();

    // Activate the student user account
    const user = await this.userModel
      .findOne({
        $or: [
          { studentId: student.id },
          { email: student.email, role: Role.STUDENT },
        ],
      })
      .exec();

    if (user) {
      user.isActive = true;
      user.studentId = student.id;
      await user.save();
    }

    // Send verification confirmation email
    await this.mailService.sendStudentVerificationEmail({
      to: student.email,
      fullName: student.fullName,
      studentId: student.id,
    });

    const enriched = await this.buildStudentDetail(student.toObject());
    return {
      message: 'Student verified and activated successfully',
      student: enriched,
    };
  }

  private async generateNextStudentUserId(): Promise<string> {
    const existing = await this.userModel
      .find({ id: /^STU-USR-\d+$/ }, { id: 1 })
      .lean<Pick<User, 'id'>[]>()
      .exec();

    const max = existing.reduce((mx, u) => {
      const parts = u.id.split('-');
      const num = Number(parts[2]) || 0;
      return Math.max(mx, num);
    }, 0);

    return `STU-USR-${String(max + 1).padStart(3, '0')}`;
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private isDuplicateKeyError(error: unknown, field: string): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const mongoError = error as {
      code?: number;
      keyPattern?: Record<string, unknown>;
      message?: string;
    };

    if (mongoError.code !== 11000) {
      return false;
    }

    if (mongoError.keyPattern && field in mongoError.keyPattern) {
      return true;
    }

    return Boolean(mongoError.message?.includes(field));
  }
}
