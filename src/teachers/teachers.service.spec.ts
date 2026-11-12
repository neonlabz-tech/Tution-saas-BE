import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { SortDirection } from '../enums/sort-direction.enum.js';
import { ClassStatus, ModuleStatus, TeacherStatus } from '../enums/status.enum.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { OnlineClass } from '../online-classes/schemas/online-class.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import { Teacher } from './schemas/teacher.schema.js';
import { TeachersService } from './teachers.service.js';

function mockQuery<T>(result: T) {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
  return chain;
}

describe('TeachersService', () => {
  let service: TeachersService;
  let teacherModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let onlineClassModel: Record<string, ReturnType<typeof vi.fn>>;

  const sampleTeachers: Teacher[] = [
    {
      id: 'TCH-001',
      fullName: 'Dr. Anura Wijesekara',
      email: 'anura.w@eduflow.lk',
      phone: '0771234501',
      qualification: 'PhD in Mathematics',
      specialization: 'Calculus & Algebra',
      batches: ['2025-A Morning', '2025-B Evening'],
      moduleIds: ['mod_mth', 'mod_phy'],
      joiningDate: '2019-02-11',
      status: TeacherStatus.ACTIVE,
    },
    {
      id: 'TCH-002',
      fullName: 'Mr. Kalum Ranasinghe',
      email: 'kalum.r@eduflow.lk',
      phone: '0771234508',
      qualification: 'MSc in Economics',
      specialization: 'Macroeconomics',
      batches: ['2026-A Weekend'],
      moduleIds: [],
      joiningDate: '2023-01-30',
      status: TeacherStatus.ON_LEAVE,
    },
  ];

  const sampleModules: CourseModule[] = [
    {
      id: 'mod_mth',
      code: 'MTH-101',
      name: 'Advanced Mathematics',
      description: 'Calculus and algebra',
      fee: 72000,
      duration: '6 months',
      teacherId: 'TCH-001',
      batches: ['2025-A Morning'],
      status: ModuleStatus.ACTIVE,
    },
    {
      id: 'mod_phy',
      code: 'PHY-102',
      name: 'Physics',
      description: 'Mechanics',
      fee: 68000,
      duration: '6 months',
      teacherId: 'TCH-001',
      batches: ['2025-A Morning'],
      status: ModuleStatus.ACTIVE,
    },
    {
      id: 'mod_eco',
      code: 'ECO-108',
      name: 'Economics',
      description: 'Macroeconomics',
      fee: 56000,
      duration: '5 months',
      teacherId: null,
      batches: ['2026-A Weekend'],
      status: ModuleStatus.UPCOMING,
    },
  ];

  const sampleStudents: Pick<Student, 'id' | 'moduleIds'>[] = [
    { id: 'STU-2025-001', moduleIds: ['mod_mth', 'mod_phy'] },
    { id: 'STU-2025-002', moduleIds: ['mod_mth'] },
    { id: 'STU-2025-003', moduleIds: ['mod_eco'] },
  ];

  beforeEach(async () => {
    teacherModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateMany: vi.fn().mockReturnValue(mockQuery({ modifiedCount: 0 })),
      deleteOne: vi.fn(),
      aggregate: vi.fn(),
      countDocuments: vi.fn(),
    };
    moduleModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      updateMany: vi.fn(),
      countDocuments: vi.fn(),
      estimatedDocumentCount: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(3),
      }),
    };
    studentModel = {
      find: vi.fn(),
    };
    onlineClassModel = {
      find: vi.fn(),
      deleteMany: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: getModelToken(Teacher.name), useValue: teacherModel },
        { provide: getModelToken(CourseModule.name), useValue: moduleModel },
        { provide: getModelToken(Student.name), useValue: studentModel },
        { provide: getModelToken(OnlineClass.name), useValue: onlineClassModel },
      ],
    }).compile();

    service = module.get<TeachersService>(TeachersService);
  });

  describe('getAllTeachers', () => {
    it('returns PaginatedDto with aggregated teachers, workload, and global KPI metrics', async () => {
      const aggregatedTeachers = [
        {
          ...sampleTeachers[0],
          assignedModules: [
            { id: 'mod_mth', code: 'MTH-101', name: 'Advanced Mathematics', studentCount: 2 },
            { id: 'mod_phy', code: 'PHY-102', name: 'Physics', studentCount: 1 },
          ],
          workload: {
            modulesCount: 2,
            studentsCount: 2,
            hoursPerWeek: 6,
          },
        },
      ];

      teacherModel.aggregate
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue(aggregatedTeachers) })
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue([
            {
              totalTeachers: 2,
              activeTeachers: 1,
              totalAssignedModules: 2,
              teachersWithoutModules: 1,
            },
          ]),
        });
      teacherModel.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(2),
      });

      const res = await service.getAllTeachers(10, 1, 'createdAt', SortDirection.Descending);

      expect(res.page).toBe(1);
      expect(res.limit).toBe(10);
      expect(res.total).toBe(2);
      expect(res.totalPages).toBe(1);
      expect(res.metrics).toEqual({
        totalTeachers: 2,
        activeTeachers: 1,
        weeklyTeachingHours: 6,
        teachersWithoutModules: 1,
      });
      expect(res.data).toHaveLength(1);
      expect(res.data[0].workload.studentsCount).toBe(2);
    });

    it('applies filterModel quickFilterValues, moduleId, batch, and status in pipeline', async () => {
      moduleModel.findOne.mockReturnValue(mockQuery({ teacherId: 'TCH-001' }));
      teacherModel.aggregate
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue([sampleTeachers[0]]) })
        .mockReturnValueOnce({
          exec: vi.fn().mockResolvedValue([
            {
              totalTeachers: 2,
              activeTeachers: 1,
              totalAssignedModules: 2,
              teachersWithoutModules: 1,
            },
          ]),
        });
      teacherModel.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });

      const res = await service.getAllTeachers(
        10,
        1,
        'fullName',
        SortDirection.Ascending,
        JSON.stringify({ quickFilterValues: ['calculus'] }),
        TeacherStatus.ACTIVE,
        'mod_mth',
        '2025-A Morning',
      );

      expect(moduleModel.findOne).toHaveBeenCalledWith(
        { id: 'mod_mth' },
        { teacherId: 1 },
      );
      const pipeline = teacherModel.aggregate.mock.calls[0][0] as Record<string, unknown>[];
      expect(pipeline[0]).toEqual({
        $match: expect.objectContaining({
          $and: expect.any(Array),
        }),
      });
      expect(pipeline[1]).toEqual({ $sort: { fullName: 1 } });
      expect(res.total).toBe(1);
      expect(res.metrics?.totalTeachers).toBe(2);
      expect(res.metrics?.teachersWithoutModules).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns full teacher profile with modules, workload, and upcoming schedule', async () => {
      const upcoming: OnlineClass[] = [
        {
          id: 'cls_1',
          title: 'Calculus Revision',
          moduleId: 'mod_mth',
          teacherId: 'TCH-001',
          batch: '2025-A Morning',
          start: '2026-11-12T10:30',
          end: '2026-11-12T12:00',
          link: 'https://meet.example.com/1',
          description: '',
          status: ClassStatus.SCHEDULED,
        },
      ];

      teacherModel.findOne.mockReturnValue(mockQuery(sampleTeachers[0]));
      moduleModel.find.mockReturnValue(mockQuery(sampleModules.slice(0, 2)));
      studentModel.find.mockReturnValue(mockQuery(sampleStudents.slice(0, 2)));
      onlineClassModel.find.mockReturnValue(mockQuery(upcoming));

      const res = await service.findOne('TCH-001');

      expect(res.id).toBe('TCH-001');
      expect(res.workload).toEqual({
        modulesCount: 2,
        studentsCount: 2,
        hoursPerWeek: 6,
      });
      expect(res.upcomingSchedule).toEqual(upcoming);
    });

    it('throws NotFoundException when teacher does not exist', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(null));

      await expect(service.findOne('TCH-999')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('creates teacher with auto-generated TCH-XXX id and assigns modules', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(null));
      moduleModel.find
        .mockReturnValueOnce(mockQuery([{ id: 'mod_eco' }]))
        .mockReturnValueOnce(mockQuery([{ ...sampleModules[2], teacherId: 'TCH-003' }]));
      teacherModel.find.mockReturnValue(
        mockQuery([{ id: 'TCH-001' }, { id: 'TCH-002' }]),
      );

      const createdTeacher: Teacher = {
        id: 'TCH-003',
        fullName: 'Ms. Nimali Perera',
        email: 'nimali@eduflow.lk',
        phone: '0771234599',
        qualification: 'MSc in Economics',
        specialization: 'Development Economics',
        batches: ['2026-A Weekend'],
        moduleIds: ['mod_eco'],
        joiningDate: '2026-11-11',
        status: TeacherStatus.ACTIVE,
      };
      teacherModel.create.mockResolvedValue({
        ...createdTeacher,
        toObject: () => createdTeacher,
      });
      moduleModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 1 }));
      studentModel.find.mockReturnValue(mockQuery([sampleStudents[2]]));
      onlineClassModel.find.mockReturnValue(mockQuery([]));

      const res = await service.create({
        fullName: 'Ms. Nimali Perera',
        email: 'Nimali@eduflow.lk',
        phone: '0771234599',
        qualification: 'MSc in Economics',
        specialization: 'Development Economics',
        batches: ['2026-A Weekend'],
        joiningDate: '2026-11-11',
        moduleIds: ['mod_eco'],
      });

      expect(teacherModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'TCH-003',
          email: 'nimali@eduflow.lk',
          status: TeacherStatus.ACTIVE,
        }),
      );
      expect(moduleModel.updateMany).toHaveBeenCalledWith(
        { id: { $in: ['mod_eco'] } },
        { $set: { teacherId: 'TCH-003' } },
      );
      expect(res.id).toBe('TCH-003');
      expect(res.assignedModules).toHaveLength(1);
    });

    it('creates teacher with only required fields when optional fields are omitted', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(null));
      teacherModel.find.mockReturnValue(mockQuery([]));
      const minimalTeacher: Teacher = {
        id: 'TCH-001',
        fullName: 'Ms. Kasuni Silva',
        email: 'kasuni@eduflow.lk',
        phone: '0771234510',
        qualification: '',
        specialization: '',
        batches: [],
        moduleIds: [],
        joiningDate: '2026-11-11',
        status: TeacherStatus.ACTIVE,
      };
      teacherModel.create.mockResolvedValue({
        ...minimalTeacher,
        toObject: () => minimalTeacher,
      });
      moduleModel.find.mockReturnValue(mockQuery([]));
      onlineClassModel.find.mockReturnValue(mockQuery([]));

      const res = await service.create({
        fullName: 'Ms. Kasuni Silva',
        email: 'kasuni@eduflow.lk',
        phone: '0771234510',
        joiningDate: '2026-11-11',
      });

      expect(teacherModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'TCH-001',
          qualification: '',
          specialization: '',
          batches: [],
          status: TeacherStatus.ACTIVE,
        }),
      );
      expect(res.assignedModules).toEqual([]);
    });

    it('throws ConflictException when email already exists', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(sampleTeachers[0]));

      await expect(
        service.create({
          fullName: 'Duplicate Teacher',
          email: 'anura.w@eduflow.lk',
          phone: '0771234501',
          qualification: 'MSc',
          specialization: 'Math',
          batches: ['2025-A Morning'],
          joiningDate: '2026-11-11',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when any moduleId does not exist', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(null));
      moduleModel.find.mockReturnValue(mockQuery([]));

      await expect(
        service.create({
          fullName: 'Valid Teacher',
          email: 'valid@eduflow.lk',
          phone: '0771234501',
          qualification: 'MSc',
          specialization: 'Math',
          batches: ['2025-A Morning'],
          joiningDate: '2026-11-11',
          moduleIds: ['mod_unknown'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('updates teacher fields and syncs modules bidirectionally', async () => {
      const updatedTeacher: Teacher = {
        ...sampleTeachers[0],
        specialization: 'Applied Mathematics',
      };
      teacherModel.findOne.mockReturnValue(mockQuery(sampleTeachers[0]));
      moduleModel.find
        .mockReturnValueOnce(mockQuery([{ id: 'mod_mth' }, { id: 'mod_eco' }]))
        .mockReturnValueOnce(
          mockQuery([
            sampleModules[0],
            { ...sampleModules[2], teacherId: 'TCH-001' },
          ]),
        );
      teacherModel.findOneAndUpdate.mockReturnValue(mockQuery(updatedTeacher));
      moduleModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 1 }));
      studentModel.find.mockReturnValue(mockQuery(sampleStudents));
      onlineClassModel.find.mockReturnValue(mockQuery([]));

      const res = await service.update('TCH-001', {
        specialization: 'Applied Mathematics',
        moduleIds: ['mod_mth', 'mod_eco'],
      });

      expect(moduleModel.updateMany).toHaveBeenCalledWith(
        { teacherId: 'TCH-001', id: { $nin: ['mod_mth', 'mod_eco'] } },
        { $set: { teacherId: null } },
      );
      expect(moduleModel.updateMany).toHaveBeenCalledWith(
        { id: { $in: ['mod_mth', 'mod_eco'] } },
        { $set: { teacherId: 'TCH-001' } },
      );
      expect(res.specialization).toBe('Applied Mathematics');
      expect(res.assignedModules.map((m) => m.id)).toEqual(['mod_mth', 'mod_eco']);
    });

    it('allows saving moduleIds on teacher when modules collection is empty', async () => {
      moduleModel.estimatedDocumentCount.mockReturnValue({
        exec: vi.fn().mockResolvedValue(0),
      });
      const updatedTeacher: Teacher = {
        ...sampleTeachers[1],
        moduleIds: ['mod_mth', 'mod_acc'],
      };
      teacherModel.findOne.mockReturnValue(mockQuery(sampleTeachers[1]));
      teacherModel.findOneAndUpdate.mockReturnValue(mockQuery(updatedTeacher));
      moduleModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 0 }));
      moduleModel.find.mockReturnValue(mockQuery([]));
      onlineClassModel.find.mockReturnValue(mockQuery([]));

      const res = await service.update('TCH-002', {
        moduleIds: ['mod_mth', 'mod_acc'],
      });

      expect(res.moduleIds).toEqual(['mod_mth', 'mod_acc']);
      expect(res.workload.modulesCount).toBe(2);
      expect(res.workload.hoursPerWeek).toBe(6);
    });

    it('throws NotFoundException if teacher does not exist', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(null));

      await expect(
        service.update('TCH-999', { fullName: 'Updated Name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('unassigns modules, deletes online classes, and deletes teacher', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(sampleTeachers[0]));
      moduleModel.updateMany.mockReturnValue(mockQuery({ modifiedCount: 2 }));
      onlineClassModel.deleteMany.mockReturnValue(mockQuery({ deletedCount: 4 }));
      teacherModel.deleteOne.mockReturnValue(mockQuery({ deletedCount: 1 }));

      const res = await service.remove('TCH-001');

      expect(moduleModel.updateMany).toHaveBeenCalledWith(
        { teacherId: 'TCH-001' },
        { $set: { teacherId: null } },
      );
      expect(onlineClassModel.deleteMany).toHaveBeenCalledWith({
        teacherId: 'TCH-001',
      });
      expect(teacherModel.deleteOne).toHaveBeenCalledWith({ id: 'TCH-001' });
      expect(res).toEqual({
        deleted: true,
        id: 'TCH-001',
        unassignedModulesCount: 2,
        deletedClassesCount: 4,
      });
    });

    it('throws NotFoundException when deleting non-existent teacher', async () => {
      teacherModel.findOne.mockReturnValue(mockQuery(null));

      await expect(service.remove('TCH-999')).rejects.toThrow(NotFoundException);
    });
  });
});
