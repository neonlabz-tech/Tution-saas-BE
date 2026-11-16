import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatus } from '../enums/status.enum.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceRecord } from './schemas/attendance.schema.js';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let attendanceModel: Record<string, ReturnType<typeof vi.fn>>;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;

  const mockQuery = (result: unknown) => ({
    lean: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  });

  const mockStudent = {
    id: 'STU-2026-001',
    ref: 'ref_abc123',
    fullName: 'Nimal Perera',
    email: 'nimal@gmail.com',
    phone: '0771234567',
    batch: '2026 A/L',
    status: 'active',
    moduleIds: ['mod_mth_101'],
  };

  const mockModule = {
    id: 'mod_mth_101',
    name: 'Pure Mathematics',
    code: 'MTH-101',
    fee: 75000,
  };

  const mockAttendance = {
    id: 'att_STU-2026-001_mod_mth_101_2026-11-16',
    studentId: 'STU-2026-001',
    moduleId: 'mod_mth_101',
    date: '2026-11-16',
    status: AttendanceStatus.PRESENT,
    method: 'qr',
  };

  beforeEach(async () => {
    attendanceModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      deleteOne: vi.fn(),
    };

    studentModel = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    moduleModel = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: getModelToken(AttendanceRecord.name),
          useValue: attendanceModel,
        },
        {
          provide: getModelToken(Student.name),
          useValue: studentModel,
        },
        {
          provide: getModelToken(CourseModule.name),
          useValue: moduleModel,
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  describe('resolveStudent', () => {
    it('resolves student by raw ref', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      const res = await service.resolveStudent('ref_abc123');
      expect(res.fullName).toBe('Nimal Perera');
    });

    it('resolves student by EDUFLOW:ref payload', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      const res = await service.resolveStudent('EDUFLOW:ref_abc123');
      expect(res.fullName).toBe('Nimal Perera');
    });

    it('throws NotFoundException when student not found', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(null));
      await expect(service.resolveStudent('unknown_ref')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for empty code', async () => {
      await expect(service.resolveStudent('   ')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('verifyQr', () => {
    it('verifies active student successfully without module check', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      const res = await service.verifyQr({ code: 'EDUFLOW:ref_abc123' });
      expect(res.valid).toBe(true);
      expect(res.student.fullName).toBe('Nimal Perera');
    });

    it('throws BadRequestException if student is inactive', async () => {
      studentModel.findOne.mockReturnValue(
        mockQuery({ ...mockStudent, status: 'inactive' }),
      );
      await expect(
        service.verifyQr({ code: 'EDUFLOW:ref_abc123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns valid: false when student not enrolled in specified module', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(
        mockQuery({ id: 'mod_other', name: 'Physics', code: 'PHY-102' }),
      );

      const res = await service.verifyQr({
        code: 'EDUFLOW:ref_abc123',
        moduleId: 'mod_other',
      });
      expect(res.valid).toBe(false);
      expect(res.enrolledInModule).toBe(false);
    });

    it('detects if student has already been marked for today', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(mockQuery(mockModule));
      attendanceModel.findOne.mockReturnValue(mockQuery(mockAttendance));

      const res = await service.verifyQr({
        code: 'EDUFLOW:ref_abc123',
        moduleId: 'mod_mth_101',
        date: '2026-11-16',
      });
      expect(res.valid).toBe(true);
      expect(res.alreadyMarked).toBe(true);
      expect(res.existingAttendance).toBeDefined();
    });
  });

  describe('markQrAttendance', () => {
    it('creates attendance record via QR scan', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(mockQuery(mockModule));
      attendanceModel.findOne.mockReturnValue(mockQuery(null));
      attendanceModel.create.mockResolvedValue({
        ...mockAttendance,
        toObject: () => mockAttendance,
      });

      const res = await service.markQrAttendance({
        code: 'EDUFLOW:ref_abc123',
        moduleId: 'mod_mth_101',
        date: '2026-11-16',
      });

      expect(res.success).toBe(true);
      expect(res.isNew).toBe(true);
      expect(res.student.fullName).toBe('Nimal Perera');
      expect(res.record.method).toBe('qr');
    });

    it('updates existing attendance record if already marked', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(mockQuery(mockModule));
      const existingDoc = {
        ...mockAttendance,
        status: AttendanceStatus.LATE,
        method: 'manual',
        save: vi.fn().mockResolvedValue({
          ...mockAttendance,
          status: AttendanceStatus.PRESENT,
          method: 'qr',
          toObject: () => ({ ...mockAttendance, status: AttendanceStatus.PRESENT, method: 'qr' }),
        }),
      };
      attendanceModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingDoc),
      });

      const res = await service.markQrAttendance({
        code: 'EDUFLOW:ref_abc123',
        moduleId: 'mod_mth_101',
        date: '2026-11-16',
        status: AttendanceStatus.PRESENT,
      });

      expect(res.success).toBe(true);
      expect(res.isNew).toBe(false);
      expect(existingDoc.save).toHaveBeenCalled();
    });

    it('rejects if student is not enrolled in the module', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(
        mockQuery({ id: 'mod_chem', name: 'Chemistry', code: 'CHE-103' }),
      );

      await expect(
        service.markQrAttendance({
          code: 'EDUFLOW:ref_abc123',
          moduleId: 'mod_chem',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns filtered attendance records', async () => {
      attendanceModel.find.mockReturnValue(mockQuery([mockAttendance]));
      const res = await service.findAll({ moduleId: 'mod_mth_101' });
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe(mockAttendance.id);
    });
  });

  describe('getStats', () => {
    it('computes attendance counts and rate', async () => {
      attendanceModel.find.mockReturnValue(
        mockQuery([
          { ...mockAttendance, status: AttendanceStatus.PRESENT },
          { ...mockAttendance, status: AttendanceStatus.LATE },
          { ...mockAttendance, status: AttendanceStatus.ABSENT },
        ]),
      );

      const stats = await service.getStats('2026-11-16', 'mod_mth_101');
      expect(stats.counts.present).toBe(1);
      expect(stats.counts.late).toBe(1);
      expect(stats.counts.absent).toBe(1);
      expect(stats.counts.total).toBe(3);
      expect(stats.rate).toBe(66.7);
    });
  });

  describe('delete', () => {
    it('deletes attendance record', async () => {
      attendanceModel.deleteOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      });
      const res = await service.delete('att_123');
      expect(res.deleted).toBe(true);
    });

    it('throws NotFoundException if record to delete does not exist', async () => {
      attendanceModel.deleteOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      });
      await expect(service.delete('att_unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
