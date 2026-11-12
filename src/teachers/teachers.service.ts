import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import { PaginatedDto } from '../common/dto/paginated.dto.js';
import {
  buildFilterQuery,
  type GridFilterModel,
  type QuickFilterConfig,
} from '../common/utils/filter.util.js';
import { getPaginationParams } from '../common/utils/pagination.util.js';
import { SortDirection } from '../enums/sort-direction.enum.js';
import { ClassStatus, TeacherStatus } from '../enums/status.enum.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  OnlineClass,
  type OnlineClassDocument,
} from '../online-classes/schemas/online-class.schema.js';
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import { CreateTeacherDto } from './dto/create-teacher.dto.js';
import { UpdateTeacherDto } from './dto/update-teacher.dto.js';
import { Teacher, type TeacherDocument } from './schemas/teacher.schema.js';

const HOURS_PER_MODULE = 3;
const UPCOMING_SCHEDULE_LIMIT = 8;
const ALLOWED_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'id',
  'fullName',
  'email',
  'joiningDate',
  'status',
  'specialization',
]);

export interface TeacherModuleSummary {
  id: string;
  code: string;
  name: string;
  studentCount: number;
}

export interface TeacherWorkload {
  modulesCount: number;
  studentsCount: number;
  hoursPerWeek: number;
}

export interface TeacherListItem extends Teacher {
  assignedModules: TeacherModuleSummary[];
  workload: TeacherWorkload;
}

export interface TeachersMetrics {
  totalTeachers: number;
  activeTeachers: number;
  weeklyTeachingHours: number;
  teachersWithoutModules: number;
}

export interface TeacherProfileResponse extends TeacherListItem {
  upcomingSchedule: OnlineClass[];
}

export interface DeleteTeacherResponse {
  deleted: true;
  id: string;
  unassignedModulesCount: number;
  deletedClassesCount: number;
}

@Injectable()
export class TeachersService {
  constructor(
    @InjectModel(Teacher.name)
    private readonly teacherModel: Model<TeacherDocument>,
    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(OnlineClass.name)
    private readonly onlineClassModel: Model<OnlineClassDocument>,
  ) {}

  async getAllTeachers(
    limit?: number,
    page?: number,
    sortField: string = 'createdAt',
    sortDirection: SortDirection = SortDirection.Descending,
    filterModel?: GridFilterModel | string,
    status?: TeacherStatus | 'all',
    moduleId?: string,
    batch?: string,
    q?: string,
  ): Promise<PaginatedDto<TeacherListItem, TeachersMetrics>> {
    const {
      limit: validatedLimit,
      page: validatedPage,
      skip,
    } = getPaginationParams(limit, page);

    const teacherQuickFilterConfig: QuickFilterConfig = {
      fields: [
        { field: 'id', type: 'string' },
        { field: 'fullName', type: 'string' },
        { field: 'specialization', type: 'string' },
        { field: 'email', type: 'string' },
      ],
    };

    const effectiveFilterModel =
      !filterModel && q?.trim()
        ? { quickFilterValues: [q.trim()] }
        : filterModel;

    let filterQuery = buildFilterQuery(
      effectiveFilterModel,
      teacherQuickFilterConfig,
    );

    if (status && status !== 'all') {
      filterQuery.status = status;
    }

    if (batch && batch !== 'all') {
      filterQuery.batches = batch;
    }

    if (moduleId && moduleId !== 'all') {
      const targetModule = await this.moduleModel
        .findOne({ id: moduleId }, { teacherId: 1 })
        .lean<Pick<CourseModule, 'teacherId'>>()
        .exec();

      const targetTeacherFilter = targetModule
        ? { id: targetModule.teacherId ?? '__NO_MATCH__' }
        : { moduleIds: moduleId };
      filterQuery =
        Object.keys(filterQuery).length > 0
          ? { $and: [filterQuery, targetTeacherFilter] }
          : targetTeacherFilter;
    }

    const safeSortField = ALLOWED_SORT_FIELDS.has(sortField)
      ? sortField
      : 'createdAt';
    const sortOptions: Record<string, 1 | -1> = {
      [safeSortField]: sortDirection === SortDirection.Ascending ? 1 : -1,
    };

    const aggregationPipeline: PipelineStage[] = [
      { $match: filterQuery },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: validatedLimit },
      {
        $lookup: {
          from: 'modules',
          localField: 'id',
          foreignField: 'teacherId',
          as: 'assignedModulesRaw',
        },
      },
      {
        $lookup: {
          from: 'students',
          let: { modIds: '$assignedModulesRaw.id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $gt: [
                    {
                      $size: {
                        $setIntersection: ['$moduleIds', '$$modIds'],
                      },
                    },
                    0,
                  ],
                },
              },
            },
            { $project: { _id: 0, id: 1, moduleIds: 1 } },
          ],
          as: 'enrolledStudents',
        },
      },
      {
        $addFields: {
          assignedModules: {
            $map: {
              input: '$assignedModulesRaw',
              as: 'mod',
              in: {
                id: '$$mod.id',
                code: '$$mod.code',
                name: '$$mod.name',
                studentCount: {
                  $size: {
                    $filter: {
                      input: '$enrolledStudents',
                      as: 'stu',
                      cond: { $in: ['$$mod.id', '$$stu.moduleIds'] },
                    },
                  },
                },
              },
            },
          },
          workload: {
            modulesCount: {
              $cond: [
                { $gt: [{ $size: '$assignedModulesRaw' }, 0] },
                { $size: '$assignedModulesRaw' },
                { $size: { $ifNull: ['$moduleIds', []] } },
              ],
            },
            studentsCount: { $size: '$enrolledStudents' },
            hoursPerWeek: {
              $multiply: [
                {
                  $cond: [
                    { $gt: [{ $size: '$assignedModulesRaw' }, 0] },
                    { $size: '$assignedModulesRaw' },
                    { $size: { $ifNull: ['$moduleIds', []] } },
                  ],
                },
                HOURS_PER_MODULE,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          fullName: 1,
          email: 1,
          phone: 1,
          qualification: 1,
          specialization: 1,
          batches: 1,
          moduleIds: { $ifNull: ['$moduleIds', []] },
          joiningDate: 1,
          status: 1,
          createdAt: 1,
          updatedAt: 1,
          assignedModules: 1,
          workload: 1,
        },
      },
    ];

    const metricsPipeline: PipelineStage[] = [
      {
        $lookup: {
          from: 'modules',
          localField: 'id',
          foreignField: 'teacherId',
          as: 'mods',
        },
      },
      {
        $addFields: {
          effectiveModuleCount: {
            $cond: [
              { $gt: [{ $size: '$mods' }, 0] },
              { $size: '$mods' },
              { $size: { $ifNull: ['$moduleIds', []] } },
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          totalTeachers: { $sum: 1 },
          activeTeachers: {
            $sum: {
              $cond: [{ $eq: ['$status', TeacherStatus.ACTIVE] }, 1, 0],
            },
          },
          totalAssignedModules: { $sum: '$effectiveModuleCount' },
          teachersWithoutModules: {
            $sum: {
              $cond: [{ $eq: ['$effectiveModuleCount', 0] }, 1, 0],
            },
          },
        },
      },
    ];

    const [teachers, total, metricsRows] = await Promise.all([
      this.teacherModel
        .aggregate<TeacherListItem>(aggregationPipeline)
        .exec(),
      this.teacherModel.countDocuments(filterQuery).exec(),
      this.teacherModel
        .aggregate<{
          totalTeachers: number;
          activeTeachers: number;
          totalAssignedModules: number;
          teachersWithoutModules: number;
        }>(metricsPipeline)
        .exec(),
    ]);

    const summary = metricsRows[0] ?? {
      totalTeachers: 0,
      activeTeachers: 0,
      totalAssignedModules: 0,
      teachersWithoutModules: 0,
    };

    const metrics: TeachersMetrics = {
      totalTeachers: summary.totalTeachers,
      activeTeachers: summary.activeTeachers,
      weeklyTeachingHours: summary.totalAssignedModules * HOURS_PER_MODULE,
      teachersWithoutModules: summary.teachersWithoutModules,
    };

    return new PaginatedDto(
      validatedPage,
      validatedLimit,
      total,
      teachers,
      metrics,
    );
  }

  async findOne(id: string): Promise<TeacherProfileResponse> {
    const teacher = await this.teacherModel
      .findOne({ id })
      .lean<Teacher>()
      .exec();
    if (!teacher) {
      throw new NotFoundException(`Teacher with ID "${id}" not found`);
    }
    return this.buildTeacherProfile(teacher);
  }

  async create(dto: CreateTeacherDto): Promise<TeacherProfileResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existingEmail = await this.teacherModel
      .findOne({ email: normalizedEmail })
      .lean<Teacher>()
      .exec();
    if (existingEmail) {
      throw new ConflictException(
        `A teacher with email "${normalizedEmail}" already exists`,
      );
    }

    const moduleIds = [...new Set(dto.moduleIds ?? [])];
    await this.validateModuleIds(moduleIds);

    const id = await this.generateNextTeacherId();
    const createdDoc = await this.teacherModel.create({
      id,
      fullName: dto.fullName.trim(),
      email: normalizedEmail,
      phone: dto.phone.trim(),
      qualification: (dto.qualification ?? '').trim(),
      specialization: (dto.specialization ?? '').trim(),
      batches: dto.batches ?? [],
      moduleIds,
      joiningDate: dto.joiningDate,
      status: dto.status ?? TeacherStatus.ACTIVE,
    });

    if (moduleIds.length > 0) {
      await Promise.all([
        this.teacherModel
          .updateMany(
            { id: { $ne: createdDoc.id }, moduleIds: { $in: moduleIds } },
            { $pull: { moduleIds: { $in: moduleIds } } },
          )
          .exec(),
        this.moduleModel
          .updateMany(
            { id: { $in: moduleIds } },
            { $set: { teacherId: createdDoc.id } },
          )
          .exec(),
      ]);
    }

    const teacher: Teacher =
      typeof createdDoc.toObject === 'function'
        ? (createdDoc.toObject() as Teacher)
        : (createdDoc as unknown as Teacher);

    return this.buildTeacherProfile(teacher);
  }

  async update(
    id: string,
    dto: UpdateTeacherDto,
  ): Promise<TeacherProfileResponse> {
    const existing = await this.teacherModel
      .findOne({ id })
      .lean<Teacher>()
      .exec();
    if (!existing) {
      throw new NotFoundException(`Teacher with ID "${id}" not found`);
    }

    let normalizedEmail: string | undefined;
    if (dto.email !== undefined) {
      normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email) {
        const emailOwner = await this.teacherModel
          .findOne({ email: normalizedEmail, id: { $ne: id } })
          .lean<Teacher>()
          .exec();
        if (emailOwner) {
          throw new ConflictException(
            `A teacher with email "${normalizedEmail}" already exists`,
          );
        }
      }
    }

    const moduleIds =
      dto.moduleIds !== undefined ? [...new Set(dto.moduleIds)] : undefined;
    if (moduleIds !== undefined) {
      await this.validateModuleIds(moduleIds);
    }

    const updatePayload: Partial<Teacher> = {};
    if (dto.fullName !== undefined) updatePayload.fullName = dto.fullName.trim();
    if (normalizedEmail !== undefined) updatePayload.email = normalizedEmail;
    if (dto.phone !== undefined) updatePayload.phone = dto.phone.trim();
    if (dto.qualification !== undefined)
      updatePayload.qualification = dto.qualification.trim();
    if (dto.specialization !== undefined)
      updatePayload.specialization = dto.specialization.trim();
    if (dto.batches !== undefined) updatePayload.batches = dto.batches;
    if (moduleIds !== undefined) updatePayload.moduleIds = moduleIds;
    if (dto.joiningDate !== undefined)
      updatePayload.joiningDate = dto.joiningDate;
    if (dto.status !== undefined) updatePayload.status = dto.status;

    const updated =
      Object.keys(updatePayload).length > 0
        ? await this.teacherModel
            .findOneAndUpdate({ id }, { $set: updatePayload }, { new: true })
            .lean<Teacher>()
            .exec()
        : existing;

    if (!updated) {
      throw new NotFoundException(`Teacher with ID "${id}" not found`);
    }

    if (moduleIds !== undefined) {
      await this.syncTeacherModules(id, moduleIds);
    }

    return this.buildTeacherProfile(updated);
  }

  async remove(id: string): Promise<DeleteTeacherResponse> {
    const existing = await this.teacherModel
      .findOne({ id })
      .lean<Teacher>()
      .exec();
    if (!existing) {
      throw new NotFoundException(`Teacher with ID "${id}" not found`);
    }

    const [moduleResult, classResult] = await Promise.all([
      this.moduleModel
        .updateMany({ teacherId: id }, { $set: { teacherId: null } })
        .exec(),
      this.onlineClassModel.deleteMany({ teacherId: id }).exec(),
    ]);

    await this.teacherModel.deleteOne({ id }).exec();

    return {
      deleted: true,
      id,
      unassignedModulesCount: moduleResult.modifiedCount ?? 0,
      deletedClassesCount: classResult.deletedCount ?? 0,
    };
  }

  private async buildTeacherProfile(
    teacher: Teacher,
  ): Promise<TeacherProfileResponse> {
    const assignedRaw = await this.moduleModel
      .find({ teacherId: teacher.id })
      .lean<CourseModule[]>()
      .exec();

    const assignedModuleIds = assignedRaw.map((m) => m.id);
    const todayPrefix = new Date().toISOString().slice(0, 10);

    const [students, upcomingSchedule] = await Promise.all([
      assignedModuleIds.length > 0
        ? this.studentModel
            .find({ moduleIds: { $in: assignedModuleIds } }, { id: 1, moduleIds: 1 })
            .lean<Pick<Student, 'id' | 'moduleIds'>[]>()
            .exec()
        : Promise.resolve([]),
      this.onlineClassModel
        .find({
          teacherId: teacher.id,
          status: { $ne: ClassStatus.CANCELLED },
          start: { $gte: todayPrefix },
        })
        .sort({ start: 1 })
        .limit(UPCOMING_SCHEDULE_LIMIT)
        .lean<OnlineClass[]>()
        .exec(),
    ]);

    const { assignedModules, workload } = this.computeWorkload(
      teacher.id,
      assignedRaw,
      students,
    );

    const fallbackModuleCount =
      assignedModules.length > 0
        ? assignedModules.length
        : (teacher.moduleIds?.length ?? 0);

    return {
      ...teacher,
      moduleIds: teacher.moduleIds ?? [],
      assignedModules,
      workload: {
        ...workload,
        modulesCount: fallbackModuleCount,
        hoursPerWeek: fallbackModuleCount * HOURS_PER_MODULE,
      },
      upcomingSchedule,
    };
  }

  private computeWorkload(
    teacherId: string,
    modules: Pick<CourseModule, 'id' | 'code' | 'name' | 'teacherId'>[],
    students: Pick<Student, 'id' | 'moduleIds'>[],
  ): { assignedModules: TeacherModuleSummary[]; workload: TeacherWorkload } {
    const mods = modules.filter((m) => m.teacherId === teacherId);
    const modIds = new Set(mods.map((m) => m.id));

    const uniqueStudents = new Set<string>();
    const moduleStudentCounts = new Map<string, number>();

    for (const student of students) {
      let enrolledInAny = false;
      for (const mid of student.moduleIds) {
        if (modIds.has(mid)) {
          enrolledInAny = true;
          moduleStudentCounts.set(mid, (moduleStudentCounts.get(mid) ?? 0) + 1);
        }
      }
      if (enrolledInAny) {
        uniqueStudents.add(student.id);
      }
    }

    const assignedModules: TeacherModuleSummary[] = mods.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      studentCount: moduleStudentCounts.get(m.id) ?? 0,
    }));

    return {
      assignedModules,
      workload: {
        modulesCount: assignedModules.length,
        studentsCount: uniqueStudents.size,
        hoursPerWeek: assignedModules.length * HOURS_PER_MODULE,
      },
    };
  }

  private async validateModuleIds(moduleIds: string[]): Promise<void> {
    if (moduleIds.length === 0) return;

    const moduleCount = await this.moduleModel.estimatedDocumentCount().exec();
    if (moduleCount === 0) return;

    const found = await this.moduleModel
      .find({ id: { $in: moduleIds } }, { id: 1 })
      .lean<Pick<CourseModule, 'id'>[]>()
      .exec();
    const foundIds = new Set(found.map((m) => m.id));
    const missing = moduleIds.filter((id) => !foundIds.has(id));

    if (missing.length > 0) {
      throw new BadRequestException(
        `Invalid module IDs: ${missing.join(', ')}`,
      );
    }
  }

  private async syncTeacherModules(
    teacherId: string,
    moduleIds: string[],
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [
      this.moduleModel
        .updateMany(
          { teacherId, id: { $nin: moduleIds } },
          { $set: { teacherId: null } },
        )
        .exec(),
    ];

    if (moduleIds.length > 0) {
      tasks.push(
        this.teacherModel
          .updateMany(
            { id: { $ne: teacherId }, moduleIds: { $in: moduleIds } },
            { $pull: { moduleIds: { $in: moduleIds } } },
          )
          .exec(),
        this.moduleModel
          .updateMany(
            { id: { $in: moduleIds } },
            { $set: { teacherId } },
          )
          .exec(),
      );
    }

    await Promise.all(tasks);
  }

  private async generateNextTeacherId(): Promise<string> {
    const existing = await this.teacherModel
      .find({ id: /^TCH-\d+$/ }, { id: 1 })
      .lean<Pick<Teacher, 'id'>[]>()
      .exec();

    const max = existing.reduce((mx, t) => {
      const num = Number(t.id.split('-')[1]) || 0;
      return Math.max(mx, num);
    }, 0);

    return `TCH-${String(max + 1).padStart(3, '0')}`;
  }
}
