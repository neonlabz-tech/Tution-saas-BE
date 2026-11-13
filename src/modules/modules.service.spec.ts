import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleStatus } from '../enums/status.enum.js';
import { ModulesService } from './modules.service.js';

function createChainableQuery<T>(result: T) {
  const query = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
  return query;
}

describe('ModulesService', () => {
  let service: ModulesService;

  let moduleModel: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
  };

  let teacherModel: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    updateOne: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  let studentModel: {
    find: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };

  let onlineClassModel: {
    deleteMany: ReturnType<typeof vi.fn>;
  };

  let attendanceModel: {
    deleteMany: ReturnType<typeof vi.fn>;
  };

  let mockSession: {
    withTransaction: ReturnType<typeof vi.fn>;
    endSession: ReturnType<typeof vi.fn>;
  };

  let connection: {
    startSession: ReturnType<typeof vi.fn>;
  };

  const sampleModuleDoc = {
    _id: '507f1f77bcf86cd799439011',
    id: 'mod_mth',
    code: 'MTH-101',
    name: 'Advanced Mathematics',
    description: 'Calculus, algebra and structured problem-solving.',
    fee: 72000,
    duration: '6 months',
    teacherId: 'TCH-001',
    batches: ['2025-A Morning', '2025-B Evening'],
    status: ModuleStatus.ACTIVE,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  };

  beforeEach(() => {
    mockSession = {
      withTransaction: vi.fn().mockImplementation(async (cb: () => Promise<void>) => {
        await cb();
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };

    connection = {
      startSession: vi.fn().mockResolvedValue(mockSession),
    };

    moduleModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      exists: vi.fn(),
      create: vi.fn(),
      deleteOne: vi.fn(),
    };

    teacherModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true }),
    };

    studentModel = {
      find: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ acknowledged: true, modifiedCount: 2 }),
    };

    onlineClassModel = {
      deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 3 }),
    };

    attendanceModel = {
      deleteMany: vi.fn().mockResolvedValue({ acknowledged: true, deletedCount: 5 }),
    };

    service = new ModulesService(
      moduleModel as any,
      teacherModel as any,
      studentModel as any,
      onlineClassModel as any,
      attendanceModel as any,
      connection as any,
    );
  });

  describe('findAll', () => {
    it('returns enriched modules with teacher information and enrollment counts', async () => {
      moduleModel.find.mockReturnValue(createChainableQuery([sampleModuleDoc]));
      teacherModel.find.mockReturnValue(
        createChainableQuery([{ id: 'TCH-001', fullName: 'Dr. Anura Wijesekara' }]),
      );
      studentModel.aggregate.mockResolvedValue([{ _id: 'mod_mth', count: 12 }]);

      const result = await service.findAll({});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mod_mth');
      expect(result[0].teacher).toEqual({
        id: 'TCH-001',
        fullName: 'Dr. Anura Wijesekara',
      });
      expect(result[0].enrolledCount).toBe(12);
    });

    it('returns empty array when no modules match', async () => {
      moduleModel.find.mockReturnValue(createChainableQuery([]));

      const result = await service.findAll({ q: 'NonExisting' });

      expect(result).toEqual([]);
      expect(teacherModel.find).not.toHaveBeenCalled();
      expect(studentModel.aggregate).not.toHaveBeenCalled();
    });

    it('applies query filters for q, status, teacherId, and batch', async () => {
      moduleModel.find.mockReturnValue(createChainableQuery([]));

      await service.findAll({
        q: 'math',
        status: ModuleStatus.ACTIVE,
        teacherId: 'TCH-001',
        batch: '2025-A Morning',
      });

      expect(moduleModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ModuleStatus.ACTIVE,
          teacherId: 'TCH-001',
          batches: '2025-A Morning',
          $or: expect.any(Array),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns module details with teacher and enrolled students list', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(sampleModuleDoc));
      teacherModel.findOne.mockReturnValue(
        createChainableQuery({
          id: 'TCH-001',
          fullName: 'Dr. Anura Wijesekara',
          email: 'anura@eduflow.lk',
        }),
      );
      studentModel.find.mockReturnValue(
        createChainableQuery([
          {
            id: 'STU-2026-001',
            fullName: 'Nimal Perera',
            batch: '2025-A Morning',
            status: 'active',
            email: 'nimal@mail.lk',
          },
        ]),
      );

      const result = await service.findOne('mod_mth');

      expect(result.id).toBe('mod_mth');
      expect(result.teacher).toEqual({
        id: 'TCH-001',
        fullName: 'Dr. Anura Wijesekara',
        email: 'anura@eduflow.lk',
      });
      expect(result.enrolledCount).toBe(1);
      expect(result.revenuePotential).toBe(72000);
      expect(result.enrolledStudents).toHaveLength(1);
      expect(result.enrolledStudents[0].fullName).toBe('Nimal Perera');
    });

    it('throws NotFoundException when module does not exist', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(service.findOne('invalid_mod')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a new module and updates teacher moduleIds if teacher is assigned', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(null));
      moduleModel.exists.mockResolvedValue(false);
      teacherModel.findOne.mockReturnValue(
        createChainableQuery({
          id: 'TCH-001',
          fullName: 'Dr. Anura',
          email: 'anura@eduflow.lk',
        }),
      );

      const createdDoc = {
        ...sampleModuleDoc,
        id: 'mod_auto123',
      };
      moduleModel.create.mockResolvedValue([createdDoc]);

      const result = await service.create({
        code: 'mth-101',
        name: 'Advanced Mathematics',
        description: 'Calculus and algebra description here.',
        fee: 72000,
        duration: '6 months',
        teacherId: 'TCH-001',
        batches: ['2025-A Morning'],
        status: ModuleStatus.ACTIVE,
      });

      expect(result.code).toBe('MTH-101');
      expect(teacherModel.updateOne).toHaveBeenCalledWith(
        { id: 'TCH-001' },
        { $addToSet: { moduleIds: expect.any(String) } },
      );
    });

    it('throws ConflictException if module code already exists', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(sampleModuleDoc));

      await expect(
        service.create({
          code: 'MTH-101',
          name: 'Math',
          description: 'Description long enough.',
          fee: 50000,
          duration: '6 months',
          teacherId: null,
          batches: ['2025-A Morning'],
          status: ModuleStatus.ACTIVE,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if assigned teacher does not exist', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(null));
      teacherModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(
        service.create({
          code: 'PHY-102',
          name: 'Physics',
          description: 'Physics description here.',
          fee: 68000,
          duration: '6 months',
          teacherId: 'TCH-999',
          batches: ['2025-A Morning'],
          status: ModuleStatus.ACTIVE,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates module and adjusts teacher assignments', async () => {
      const existingDoc = {
        ...sampleModuleDoc,
        teacherId: 'TCH-001',
        save: vi.fn().mockResolvedValue(true),
      };
      moduleModel.findOne.mockResolvedValue(existingDoc);
      teacherModel.findOne.mockReturnValue(
        createChainableQuery({
          id: 'TCH-002',
          fullName: 'Ms. Priyanka',
        }),
      );

      // findOne for return
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...sampleModuleDoc,
        teacherId: 'TCH-002',
        teacher: { id: 'TCH-002', fullName: 'Ms. Priyanka' },
        enrolledCount: 0,
        revenuePotential: 0,
        enrolledStudents: [],
      });

      const result = await service.update('mod_mth', {
        teacherId: 'TCH-002',
      });

      expect(teacherModel.updateOne).toHaveBeenCalledWith(
        { id: 'TCH-001' },
        { $pull: { moduleIds: 'mod_mth' } },
      );
      expect(teacherModel.updateOne).toHaveBeenCalledWith(
        { id: 'TCH-002' },
        { $addToSet: { moduleIds: 'mod_mth' } },
      );
      expect(result.teacherId).toBe('TCH-002');
    });

    it('throws BadRequestException if batches array is empty', async () => {
      const existingDoc = {
        ...sampleModuleDoc,
        save: vi.fn().mockResolvedValue(true),
      };
      moduleModel.findOne.mockResolvedValue(existingDoc);

      await expect(
        service.update('mod_mth', { batches: [] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('syncEnrollments', () => {
    it('synchronizes student enrollments atomically', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(sampleModuleDoc));
      studentModel.find
        .mockReturnValueOnce(
          createChainableQuery([
            { id: 'STU-001', status: 'active' },
            { id: 'STU-002', status: 'active' },
          ]),
        )
        .mockReturnValueOnce(
          createChainableQuery([
            {
              id: 'STU-001',
              fullName: 'Student 1',
              batch: '2025-A',
              status: 'active',
            },
            {
              id: 'STU-002',
              fullName: 'Student 2',
              batch: '2025-A',
              status: 'active',
            },
          ]),
        );

      const result = await service.syncEnrollments('mod_mth', {
        studentIds: ['STU-001', 'STU-002'],
      });

      expect(result.moduleId).toBe('mod_mth');
      expect(result.enrolledCount).toBe(2);
      expect(studentModel.updateMany).toHaveBeenCalledWith(
        { id: { $in: ['STU-001', 'STU-002'] } },
        { $addToSet: { moduleIds: 'mod_mth' } },
        expect.anything(),
      );
      expect(studentModel.updateMany).toHaveBeenCalledWith(
        { id: { $nin: ['STU-001', 'STU-002'] }, moduleIds: 'mod_mth' },
        { $pull: { moduleIds: 'mod_mth' } },
        expect.anything(),
      );
    });

    it('throws BadRequestException if any student ID does not exist', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(sampleModuleDoc));
      studentModel.find.mockReturnValue(
        createChainableQuery([{ id: 'STU-001', status: 'active' }]),
      );

      await expect(
        service.syncEnrollments('mod_mth', {
          studentIds: ['STU-001', 'STU-999'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if any student is graduated', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(sampleModuleDoc));
      studentModel.find.mockReturnValue(
        createChainableQuery([
          { id: 'STU-001', status: 'active' },
          { id: 'STU-002', status: 'graduated' },
        ]),
      );

      await expect(
        service.syncEnrollments('mod_mth', {
          studentIds: ['STU-001', 'STU-002'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes module and cascades to students, classes, attendance, and teachers', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(sampleModuleDoc));

      const result = await service.remove('mod_mth');

      expect(result.deleted).toBe(true);
      expect(moduleModel.deleteOne).toHaveBeenCalledWith(
        { _id: sampleModuleDoc._id },
        expect.anything(),
      );
      expect(studentModel.updateMany).toHaveBeenCalledWith(
        { moduleIds: 'mod_mth' },
        { $pull: { moduleIds: 'mod_mth' } },
        expect.anything(),
      );
      expect(onlineClassModel.deleteMany).toHaveBeenCalledWith(
        { moduleId: 'mod_mth' },
        expect.anything(),
      );
      expect(attendanceModel.deleteMany).toHaveBeenCalledWith(
        { moduleId: 'mod_mth' },
        expect.anything(),
      );
      expect(teacherModel.updateMany).toHaveBeenCalledWith(
        { moduleIds: 'mod_mth' },
        { $pull: { moduleIds: 'mod_mth' } },
        expect.anything(),
      );
    });

    it('throws NotFoundException if module to delete does not exist', async () => {
      moduleModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(service.remove('mod_missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
