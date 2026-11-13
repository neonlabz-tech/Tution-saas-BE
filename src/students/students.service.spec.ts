import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentRegisteredEvent } from './events/student-registered.event.js';
import { StudentsService } from './students.service.js';

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

describe('StudentsService', () => {
  let service: StudentsService;
  let studentModel: {
    countDocuments: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    exists: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findOneAndUpdate: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
  };
  let counterModel: {
    findOneAndUpdate: ReturnType<typeof vi.fn>;
  };
  let moduleModel: {
    find: ReturnType<typeof vi.fn>;
  };
  let attendanceModel: {
    find: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  let transactionModel: {
    find: ReturnType<typeof vi.fn>;
  };
  let mockSession: {
    withTransaction: ReturnType<typeof vi.fn>;
    endSession: ReturnType<typeof vi.fn>;
  };
  let connection: {
    startSession: ReturnType<typeof vi.fn>;
  };
  let eventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  const sampleModules = [
    { id: 'mod_mth', code: 'MTH-101', name: 'Advanced Mathematics', fee: 4500 },
    { id: 'mod_phy', code: 'PHY-102', name: 'Physics', fee: 4000 },
  ];

  const sampleStudent = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439011'),
    id: 'STU-2026-001',
    ref: 'abc123def456gh78',
    fullName: 'Nimal Perera',
    email: 'nimal.perera@mail.lk',
    phone: '0771234567',
    dob: '2007-05-14',
    address: '42 Temple Road, Colombo 07',
    guardianName: 'Sunil Perera',
    guardianPhone: '0712345678',
    batch: '2025-A Morning',
    moduleIds: ['mod_mth', 'mod_phy'],
    enrollmentDate: '2026-11-11',
    status: 'active' as const,
    qrRotatedAt: null,
  };

  beforeEach(() => {
    studentModel = {
      countDocuments: vi.fn(),
      find: vi.fn(),
      findOne: vi.fn(),
      exists: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
    };

    counterModel = {
      findOneAndUpdate: vi.fn(),
    };

    moduleModel = {
      find: vi.fn(),
    };

    attendanceModel = {
      find: vi.fn(),
      deleteMany: vi.fn(),
    };

    transactionModel = {
      find: vi.fn(),
    };

    mockSession = {
      withTransaction: vi.fn(async (callback: () => Promise<void>) => {
        await callback();
      }),
      endSession: vi.fn().mockResolvedValue(undefined),
    };

    connection = {
      startSession: vi.fn().mockResolvedValue(mockSession),
    };

    eventEmitter = {
      emit: vi.fn(),
    };

    service = new StudentsService(
      studentModel as never,
      counterModel as never,
      moduleModel as never,
      attendanceModel as never,
      transactionModel as never,
      connection as never,
      eventEmitter as never,
    );
  });

  describe('findAll', () => {
    it('returns paginated students with computed financial summary and counts', async () => {
      studentModel.countDocuments
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(1);

      const listQuery = createChainableQuery([sampleStudent]);
      studentModel.find.mockReturnValue(listQuery);

      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      transactionModel.find.mockReturnValue(
        createChainableQuery([
          { studentId: 'STU-2026-001', amount: 3000 },
          { studentId: 'STU-2026-001', amount: 2500 },
        ]),
      );

      const result = await service.findAll({
        q: 'Nimal',
        batch: '2025-A Morning',
        moduleId: 'mod_mth',
        status: 'active',
        page: 1,
        limit: 8,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });

      expect(studentModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          batch: '2025-A Morning',
          moduleIds: 'mod_mth',
          status: 'active',
          $or: expect.any(Array),
        }),
      );
      expect(transactionModel.find).toHaveBeenCalledWith({
        type: 'income',
        category: 'Tuition fees',
        studentId: { $in: ['STU-2026-001'] },
      });
      expect(listQuery.skip).toHaveBeenCalledWith(0);
      expect(listQuery.limit).toHaveBeenCalledWith(8);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'STU-2026-001',
        feeTotal: 8500,
        paidTotal: 5500,
        outstanding: 3000,
        modules: sampleModules,
      });
      expect(result.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 8,
        totalPages: 1,
      });
      expect(result.summary).toEqual({
        total: 12,
        filteredTotal: 1,
        activeCount: 9,
      });
    });

    it('clamps outstanding at 0 when paidTotal exceeds feeTotal and sorts by outstanding', async () => {
      const studentTwo = {
        ...sampleStudent,
        _id: new Types.ObjectId('507f1f77bcf86cd799439012'),
        id: 'STU-2026-002',
        email: 'two@mail.lk',
        moduleIds: ['mod_mth'],
      };

      studentModel.countDocuments
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2);

      studentModel.find.mockReturnValue(
        createChainableQuery([sampleStudent, studentTwo]),
      );
      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      transactionModel.find.mockReturnValue(
        createChainableQuery([
          { studentId: 'STU-2026-001', amount: 12000 }, // overpaid -> 0 outstanding
          { studentId: 'STU-2026-002', amount: 1000 }, // 3500 outstanding
        ]),
      );

      const result = await service.findAll({
        page: 1,
        limit: 8,
        sortBy: 'outstanding',
        sortOrder: 'desc',
      });

      expect(result.items[0].id).toBe('STU-2026-002');
      expect(result.items[0].outstanding).toBe(3500);
      expect(result.items[1].id).toBe('STU-2026-001');
      expect(result.items[1].outstanding).toBe(0);
    });
  });

  describe('findOne', () => {
    it('returns student detail with overview, attendance summary/rate, payments, and QR payload', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      attendanceModel.find.mockReturnValue(
        createChainableQuery([
          {
            id: 'att-1',
            studentId: 'STU-2026-001',
            moduleId: 'mod_mth',
            date: '2026-11-10',
            status: 'present',
            method: 'qr',
          },
          {
            id: 'att-2',
            studentId: 'STU-2026-001',
            moduleId: 'mod_phy',
            date: '2026-11-09',
            status: 'late',
            method: 'manual',
          },
          {
            id: 'att-3',
            studentId: 'STU-2026-001',
            moduleId: 'mod_mth',
            date: '2026-11-08',
            status: 'absent',
            method: 'manual',
          },
          {
            id: 'att-4',
            studentId: 'STU-2026-001',
            moduleId: 'mod_mth',
            date: '2026-11-07',
            status: 'excused',
            method: 'manual',
          },
        ]),
      );
      transactionModel.find.mockReturnValue(
        createChainableQuery([
          {
            id: 'tx-1',
            type: 'income',
            category: 'Tuition fees',
            amount: 4500,
            date: '2026-11-05',
            studentId: 'STU-2026-001',
            method: 'cash',
          },
          {
            id: 'tx-2',
            type: 'income',
            category: 'Registration fee',
            amount: 1500,
            date: '2026-11-01',
            studentId: 'STU-2026-001',
            method: 'card',
          },
        ]),
      );

      const detail = await service.findOne('STU-2026-001');

      expect(studentModel.findOne).toHaveBeenCalledWith({ id: 'STU-2026-001' });
      expect(detail.qrPayload).toBe('EDUFLOW:abc123def456gh78');
      expect(detail.feeTotal).toBe(8500);
      // Only Tuition fees count toward paidTotal
      expect(detail.paidTotal).toBe(4500);
      expect(detail.outstanding).toBe(4000);
      // Payments tab still includes registration + tuition transactions
      expect(detail.payments).toHaveLength(2);
      // Rate excludes excused: (1 present + 1 late) / 3 = 66.7
      expect(detail.attendanceSummary).toEqual({
        rate: 66.7,
        present: 1,
        late: 1,
        absent: 1,
        excused: 1,
      });
      expect(detail.attendanceRecords[0]).toMatchObject({
        id: 'att-1',
        moduleName: 'Advanced Mathematics',
      });
    });

    it('supports looking up by 24-char Mongo ObjectId and returns attendance rate 0 when no non-excused records exist', async () => {
      const objectId = '507f1f77bcf86cd799439011';
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      attendanceModel.find.mockReturnValue(
        createChainableQuery([
          {
            id: 'att-exc',
            studentId: 'STU-2026-001',
            moduleId: 'mod_mth',
            date: '2026-11-10',
            status: 'excused',
            method: 'manual',
          },
        ]),
      );
      transactionModel.find.mockReturnValue(createChainableQuery([]));

      const detail = await service.findOne(objectId);

      expect(studentModel.findOne).toHaveBeenCalledWith({
        $or: [{ id: objectId }, { _id: new Types.ObjectId(objectId) }],
      });
      expect(detail.attendanceSummary).toEqual({
        rate: 0,
        present: 0,
        late: 0,
        absent: 0,
        excused: 1,
      });
    });

    it('throws NotFoundException when student does not exist', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(service.findOne('STU-2026-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('lookupByCode', () => {
    it('strips EDUFLOW: prefix and resolves student by ref or STU ID', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      attendanceModel.find.mockReturnValue(createChainableQuery([]));
      transactionModel.find.mockReturnValue(createChainableQuery([]));

      const detail = await service.lookupByCode('EDUFLOW:abc123def456gh78');

      expect(studentModel.findOne).toHaveBeenCalledWith({
        $or: [
          { ref: 'abc123def456gh78' },
          { id: expect.any(RegExp) },
        ],
      });
      expect(detail.id).toBe('STU-2026-001');
    });

    it('throws BadRequestException when code is empty after prefix removal', async () => {
      await expect(service.lookupByCode('EDUFLOW:   ')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when no matching student exists', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(service.lookupByCode('unknown-ref')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const createPayload = {
      fullName: 'Nimal Perera',
      email: 'nimal.perera@mail.lk',
      phone: '0771234567',
      dob: '2007-05-14',
      address: '42 Temple Road, Colombo 07',
      guardianName: 'Sunil Perera',
      guardianPhone: '0712345678',
      batch: '2025-A Morning',
      moduleIds: ['mod_mth', 'mod_phy'],
      enrollmentDate: '2026-11-11',
      status: 'pending' as const,
    };

    it('generates sequential STU-YYYY-NNN ID, 16-char opaque ref, persists student, and emits student.registered', async () => {
      const year = new Date().getFullYear();
      studentModel.findOne.mockReturnValue(createChainableQuery(null));
      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      counterModel.findOneAndUpdate.mockReturnValue(
        createChainableQuery({ _id: `student:${year}`, seq: 1 }),
      );
      studentModel.create.mockImplementation(async (data: Record<string, unknown>) => ({
        toObject: () => data,
      }));

      const result = await service.create(createPayload);

      expect(counterModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: `student:${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      );
      expect(result.id).toBe(`STU-${year}-001`);
      expect(result.ref).toMatch(/^[0-9a-z]{16}$/);
      expect(result.status).toBe('pending');
      expect(result.feeTotal).toBe(8500);
      expect(result.paidTotal).toBe(0);
      expect(result.outstanding).toBe(8500);
      expect(result.qrPayload).toBe(`EDUFLOW:${result.ref}`);

      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'student.registered',
        expect.any(StudentRegisteredEvent),
      );
      const emittedEvent = eventEmitter.emit.mock
        .calls[0][1] as StudentRegisteredEvent;
      expect(emittedEvent).toMatchObject({
        studentId: `STU-${year}-001`,
        ref: result.ref,
        email: 'nimal.perera@mail.lk',
        status: 'pending',
      });
    });

    it('throws ConflictException when email already exists', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));

      await expect(service.create(createPayload)).rejects.toThrow(
        ConflictException,
      );
      expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when any moduleId does not exist', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(null));
      moduleModel.find.mockReturnValue(createChainableQuery([sampleModules[0]]));

      await expect(service.create(createPayload)).rejects.toThrow(
        BadRequestException,
      );
      expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates allowed fields and status transitions while protecting id and ref', async () => {
      const updatedDoc = {
        ...sampleStudent,
        status: 'graduated' as const,
        fullName: 'Nimal K. Perera',
      };
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      studentModel.findOneAndUpdate.mockReturnValue(
        createChainableQuery(updatedDoc),
      );
      moduleModel.find.mockReturnValue(createChainableQuery(sampleModules));
      attendanceModel.find.mockReturnValue(createChainableQuery([]));
      transactionModel.find.mockReturnValue(createChainableQuery([]));

      const result = await service.update('STU-2026-001', {
        fullName: 'Nimal K. Perera',
        status: 'graduated',
        id: 'HACKED-ID',
        ref: 'HACKED-REF',
      } as never);

      expect(studentModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sampleStudent._id },
        { $set: { fullName: 'Nimal K. Perera', status: 'graduated' } },
        { returnDocument: 'after' },
      );
      expect(result.status).toBe('graduated');
      expect(result.id).toBe('STU-2026-001');
      expect(result.ref).toBe('abc123def456gh78');
    });

    it('throws ConflictException when changing to an email already used by another student', async () => {
      studentModel.findOne
        .mockReturnValueOnce(createChainableQuery(sampleStudent))
        .mockReturnValueOnce(
          createChainableQuery({ id: 'STU-2026-002', email: 'taken@mail.lk' }),
        );

      await expect(
        service.update('STU-2026-001', { email: 'taken@mail.lk' }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when updated moduleIds contain an unknown module', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      moduleModel.find.mockReturnValue(createChainableQuery([]));

      await expect(
        service.update('STU-2026-001', { moduleIds: ['mod_unknown'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes student and cascades AttendanceRecord inside a transaction while preserving Transactions', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      studentModel.deleteOne.mockResolvedValue({ deletedCount: 1 });
      attendanceModel.deleteMany.mockResolvedValue({ deletedCount: 4 });

      const result = await service.remove('STU-2026-001');

      expect(connection.startSession).toHaveBeenCalledTimes(1);
      expect(mockSession.withTransaction).toHaveBeenCalledTimes(1);
      expect(studentModel.deleteOne).toHaveBeenCalledWith(
        { _id: sampleStudent._id },
        { session: mockSession },
      );
      expect(attendanceModel.deleteMany).toHaveBeenCalledWith(
        { studentId: 'STU-2026-001' },
        { session: mockSession },
      );
      expect(mockSession.endSession).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        deleted: true,
        id: 'STU-2026-001',
        deletedAttendanceCount: 4,
      });
    });

    it('throws NotFoundException without opening a transaction when student does not exist', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(service.remove('STU-2026-404')).rejects.toThrow(
        NotFoundException,
      );
      expect(connection.startSession).not.toHaveBeenCalled();
    });
  });

  describe('rotateQr', () => {
    it('atomically replaces student.ref, sets qrRotatedAt, and returns EDUFLOW payload', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(sampleStudent));
      studentModel.findOneAndUpdate.mockImplementation(
        (_filter: unknown, update: { $set: { ref: string; qrRotatedAt: Date } }) =>
          createChainableQuery({
            ...sampleStudent,
            ref: update.$set.ref,
            qrRotatedAt: update.$set.qrRotatedAt,
          }),
      );

      const result = await service.rotateQr('STU-2026-001');

      expect(result.id).toBe('STU-2026-001');
      expect(result.ref).toMatch(/^[0-9a-z]{16}$/);
      expect(result.ref).not.toBe(sampleStudent.ref);
      expect(result.qrPayload).toBe(`EDUFLOW:${result.ref}`);
      expect(result.rotatedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundException when student does not exist', async () => {
      studentModel.findOne.mockReturnValue(createChainableQuery(null));

      await expect(service.rotateQr('STU-2026-404')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
