import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type Connection, Model, Types } from 'mongoose';
import {
  AttendanceRecord,
  type AttendanceRecordDocument,
} from '../attendance/schemas/attendance.schema.js';
import { ModuleStatus } from '../enums/status.enum.js';
import {
  OnlineClass,
  type OnlineClassDocument,
} from '../online-classes/schemas/online-class.schema.js';
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import {
  Teacher,
  type TeacherDocument,
} from '../teachers/schemas/teacher.schema.js';
import type { CreateModuleDto } from './dto/create-module.dto.js';
import type { ModuleQueryDto } from './dto/module-query.dto.js';
import type { SyncEnrollmentsDto } from './dto/sync-enrollments.dto.js';
import type { UpdateModuleDto } from './dto/update-module.dto.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from './schemas/module.schema.js';

export interface ModuleListItem {
  id: string;
  code: string;
  name: string;
  description: string;
  fee: number;
  duration: string;
  teacherId: string | null;
  teacher: { id: string; fullName: string } | null;
  batches: string[];
  status: ModuleStatus;
  enrolledCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface EnrolledStudentSummary {
  id: string;
  fullName: string;
  batch: string;
  status: string;
  email?: string;
}

export interface ModuleDetailResponse extends ModuleListItem {
  revenuePotential: number;
  enrolledStudents: EnrolledStudentSummary[];
}

export interface SyncEnrollmentsResponse {
  moduleId: string;
  enrolledCount: number;
  enrolledStudents: EnrolledStudentSummary[];
}

export interface DeleteModuleResponse {
  deleted: boolean;
  id: string;
  affectedStudentsCount: number;
  deletedClassesCount: number;
  deletedAttendanceCount: number;
}

@Injectable()
export class ModulesService {
  constructor(
    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,

    @InjectModel(Teacher.name)
    private readonly teacherModel: Model<TeacherDocument>,

    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    @InjectModel(OnlineClass.name)
    private readonly onlineClassModel: Model<OnlineClassDocument>,

    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,

    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  async findAll(query: ModuleQueryDto): Promise<ModuleListItem[]> {
    const filter: Record<string, unknown> = {};

    if (query.q) {
      const escaped = this.escapeRegex(query.q);
      filter.$or = [
        { name: new RegExp(escaped, 'i') },
        { code: new RegExp(escaped, 'i') },
      ];
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.teacherId) {
      filter.teacherId = query.teacherId;
    }

    if (query.batch) {
      filter.batches = query.batch;
    }

    const modules = await this.moduleModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();

    if (modules.length === 0) {
      return [];
    }

    const teacherIds = Array.from(
      new Set(
        modules
          .map((m) => m.teacherId)
          .filter((tId): tId is string => Boolean(tId)),
      ),
    );

    const teacherMap = new Map<string, { id: string; fullName: string }>();
    if (teacherIds.length > 0) {
      const teachers = await this.teacherModel
        .find({ id: { $in: teacherIds } })
        .select('id fullName')
        .lean();
      for (const t of teachers) {
        teacherMap.set(t.id, { id: t.id, fullName: t.fullName });
      }
    }

    const moduleIds = modules.map((m) => m.id);
    const enrollmentCounts = await this.studentModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $unwind: '$moduleIds' },
      { $match: { moduleIds: { $in: moduleIds } } },
      { $group: { _id: '$moduleIds', count: { $sum: 1 } } },
    ]);

    const countMap = new Map<string, number>(
      enrollmentCounts.map((ec) => [ec._id, ec.count]),
    );

    return modules.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      description: m.description ?? '',
      fee: m.fee,
      duration: m.duration ?? '',
      teacherId: m.teacherId ?? null,
      teacher: m.teacherId ? (teacherMap.get(m.teacherId) ?? null) : null,
      batches: m.batches ?? [],
      status: m.status as ModuleStatus,
      enrolledCount: countMap.get(m.id) ?? 0,
      createdAt: (m as { createdAt?: Date }).createdAt,
      updatedAt: (m as { updatedAt?: Date }).updatedAt,
    }));
  }

  async findOne(id: string): Promise<ModuleDetailResponse> {
    const module = await this.moduleModel
      .findOne(this.buildModuleIdFilter(id))
      .lean();

    if (!module) {
      throw new NotFoundException(`Module "${id}" not found`);
    }

    let teacher: { id: string; fullName: string; email?: string } | null = null;
    if (module.teacherId) {
      const t = await this.teacherModel
        .findOne({ id: module.teacherId })
        .select('id fullName email')
        .lean();
      if (t) {
        teacher = { id: t.id, fullName: t.fullName, email: t.email };
      }
    }

    const students = await this.studentModel
      .find({ moduleIds: module.id })
      .select('id fullName batch status email')
      .sort({ fullName: 1 })
      .lean();

    const enrolledStudents: EnrolledStudentSummary[] = students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      batch: s.batch,
      status: s.status,
      email: s.email,
    }));

    const enrolledCount = enrolledStudents.length;
    const revenuePotential = module.fee * enrolledCount;

    return {
      id: module.id,
      code: module.code,
      name: module.name,
      description: module.description ?? '',
      fee: module.fee,
      duration: module.duration ?? '',
      teacherId: module.teacherId ?? null,
      teacher,
      batches: module.batches ?? [],
      status: module.status as ModuleStatus,
      enrolledCount,
      revenuePotential,
      enrolledStudents,
      createdAt: (module as { createdAt?: Date }).createdAt,
      updatedAt: (module as { updatedAt?: Date }).updatedAt,
    };
  }

  async create(dto: CreateModuleDto): Promise<ModuleDetailResponse> {
    const code = dto.code.trim().toUpperCase();

    const existingCode = await this.moduleModel.findOne({ code }).lean();
    if (existingCode) {
      throw new ConflictException(`Module with code "${code}" already exists`);
    }

    let teacher: { id: string; fullName: string; email?: string } | null = null;
    if (dto.teacherId) {
      const t = await this.teacherModel
        .findOne({ id: dto.teacherId })
        .select('id fullName email')
        .lean();
      if (!t) {
        throw new NotFoundException(
          `Teacher with ID "${dto.teacherId}" not found`,
        );
      }
      teacher = { id: t.id, fullName: t.fullName, email: t.email };
    }

    const id = await this.generateUniqueModuleId();

    const [created] = await this.moduleModel.create([
      {
        id,
        code,
        name: dto.name,
        description: dto.description,
        fee: dto.fee,
        duration: dto.duration,
        teacherId: dto.teacherId ?? null,
        batches: dto.batches,
        status: dto.status,
      },
    ]);

    if (dto.teacherId) {
      await this.teacherModel.updateOne(
        { id: dto.teacherId },
        { $addToSet: { moduleIds: id } },
      );
    }

    return {
      id: created.id,
      code: created.code,
      name: created.name,
      description: created.description ?? '',
      fee: created.fee,
      duration: created.duration ?? '',
      teacherId: created.teacherId ?? null,
      teacher,
      batches: created.batches ?? [],
      status: created.status as ModuleStatus,
      enrolledCount: 0,
      revenuePotential: 0,
      enrolledStudents: [],
      createdAt: (created as { createdAt?: Date }).createdAt,
      updatedAt: (created as { updatedAt?: Date }).updatedAt,
    };
  }

  async update(
    id: string,
    dto: UpdateModuleDto,
  ): Promise<ModuleDetailResponse> {
    const existing = await this.moduleModel.findOne(
      this.buildModuleIdFilter(id),
    );

    if (!existing) {
      throw new NotFoundException(`Module "${id}" not found`);
    }

    if (dto.code && dto.code !== existing.code) {
      const duplicate = await this.moduleModel
        .findOne({ code: dto.code, id: { $ne: existing.id } })
        .lean();
      if (duplicate) {
        throw new ConflictException(
          `Module with code "${dto.code}" already exists`,
        );
      }
      existing.code = dto.code;
    }

    if (dto.name !== undefined) {
      existing.name = dto.name;
    }

    if (dto.description !== undefined) {
      existing.description = dto.description;
    }

    if (dto.fee !== undefined) {
      existing.fee = dto.fee;
    }

    if (dto.duration !== undefined) {
      existing.duration = dto.duration;
    }

    if (dto.batches !== undefined) {
      if (dto.batches.length === 0) {
        throw new BadRequestException('A module needs at least one batch');
      }
      existing.batches = dto.batches;
    }

    if (dto.status !== undefined) {
      existing.status = dto.status;
    }

    if (dto.teacherId !== undefined) {
      const oldTeacherId = existing.teacherId;
      const newTeacherId = dto.teacherId;

      if (newTeacherId) {
        const teacher = await this.teacherModel
          .findOne({ id: newTeacherId })
          .select('id')
          .lean();
        if (!teacher) {
          throw new NotFoundException(
            `Teacher with ID "${newTeacherId}" not found`,
          );
        }
      }

      if (oldTeacherId && oldTeacherId !== newTeacherId) {
        await this.teacherModel.updateOne(
          { id: oldTeacherId },
          { $pull: { moduleIds: existing.id } },
        );
      }

      if (newTeacherId && newTeacherId !== oldTeacherId) {
        await this.teacherModel.updateOne(
          { id: newTeacherId },
          { $addToSet: { moduleIds: existing.id } },
        );
      }

      existing.teacherId = newTeacherId;
    }

    await existing.save();

    return this.findOne(existing.id);
  }

  async syncEnrollments(
    id: string,
    dto: SyncEnrollmentsDto,
  ): Promise<SyncEnrollmentsResponse> {
    const module = await this.moduleModel
      .findOne(this.buildModuleIdFilter(id))
      .lean();

    if (!module) {
      throw new NotFoundException(`Module "${id}" not found`);
    }

    const targetIds = Array.from(new Set(dto.studentIds));

    if (targetIds.length > 0) {
      const foundStudents = await this.studentModel
        .find({ id: { $in: targetIds } })
        .select('id status')
        .lean();

      const foundMap = new Map(foundStudents.map((s) => [s.id, s]));
      const missingIds = targetIds.filter((sId) => !foundMap.has(sId));
      if (missingIds.length > 0) {
        throw new BadRequestException(
          `Some student IDs were not found: ${missingIds.join(', ')}`,
        );
      }

      const graduatedStudents = foundStudents.filter(
        (s) => s.status === 'graduated',
      );
      if (graduatedStudents.length > 0) {
        throw new BadRequestException(
          `Cannot enroll graduated students: ${graduatedStudents.map((s) => s.id).join(', ')}`,
        );
      }
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (targetIds.length > 0) {
          await this.studentModel.updateMany(
            { id: { $in: targetIds } },
            { $addToSet: { moduleIds: module.id } },
            { session },
          );
        }

        await this.studentModel.updateMany(
          { id: { $nin: targetIds }, moduleIds: module.id },
          { $pull: { moduleIds: module.id } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    const updatedStudents = await this.studentModel
      .find({ moduleIds: module.id })
      .select('id fullName batch status email')
      .sort({ fullName: 1 })
      .lean();

    const enrolledStudents: EnrolledStudentSummary[] = updatedStudents.map(
      (s) => ({
        id: s.id,
        fullName: s.fullName,
        batch: s.batch,
        status: s.status,
        email: s.email,
      }),
    );

    return {
      moduleId: module.id,
      enrolledCount: enrolledStudents.length,
      enrolledStudents,
    };
  }

  async remove(id: string): Promise<DeleteModuleResponse> {
    const existing = await this.moduleModel
      .findOne(this.buildModuleIdFilter(id))
      .lean();

    if (!existing) {
      throw new NotFoundException(`Module "${id}" not found`);
    }

    let affectedStudentsCount = 0;
    let deletedClassesCount = 0;
    let deletedAttendanceCount = 0;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.moduleModel.deleteOne({ _id: existing._id }, { session });

        const studentRes = await this.studentModel.updateMany(
          { moduleIds: existing.id },
          { $pull: { moduleIds: existing.id } },
          { session },
        );
        affectedStudentsCount = studentRes.modifiedCount ?? 0;

        const classRes = await this.onlineClassModel.deleteMany(
          { moduleId: existing.id },
          { session },
        );
        deletedClassesCount = classRes.deletedCount ?? 0;

        const attRes = await this.attendanceModel.deleteMany(
          { moduleId: existing.id },
          { session },
        );
        deletedAttendanceCount = attRes.deletedCount ?? 0;

        await this.teacherModel.updateMany(
          { moduleIds: existing.id },
          { $pull: { moduleIds: existing.id } },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    return {
      deleted: true,
      id: existing.id,
      affectedStudentsCount,
      deletedClassesCount,
      deletedAttendanceCount,
    };
  }

  private buildModuleIdFilter(idOrObjectId: string): Record<string, unknown> {
    const trimmed = idOrObjectId.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed) && Types.ObjectId.isValid(trimmed)) {
      return { $or: [{ id: trimmed }, { _id: new Types.ObjectId(trimmed) }] };
    }
    return { id: trimmed };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async generateUniqueModuleId(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = `mod_${randomBytes(4).toString('hex')}`;
      const exists = await this.moduleModel.exists({ id: candidate });
      if (!exists) {
        return candidate;
      }
    }
    return `mod_${Date.now()}`;
  }
}
