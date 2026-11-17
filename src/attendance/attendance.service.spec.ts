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

  describe('upsertAttendance', () => {
    it('creates attendance record when none exists', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(mockQuery(mockModule));
      attendanceModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      attendanceModel.create.mockResolvedValue(mockAttendance);

      const res = await service.upsertAttendance({
        studentId: 'STU-2026-001',
        moduleId: 'mod_mth_101',
        date: '2026-11-16',
        status: AttendanceStatus.PRESENT,
        method: 'manual',
      });

      expect(res.success).toBe(true);
      expect(res.isNew).toBe(true);
    });

    it('updates attendance record when existing record exists', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      moduleModel.findOne.mockReturnValue(mockQuery(mockModule));
      const existingDoc = {
        ...mockAttendance,
        status: AttendanceStatus.ABSENT,
        save: vi.fn().mockResolvedValue({
          ...mockAttendance,
          status: AttendanceStatus.PRESENT,
        }),
      };
      attendanceModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(existingDoc),
      });

      const res = await service.upsertAttendance({
        studentId: 'STU-2026-001',
        moduleId: 'mod_mth_101',
        date: '2026-11-16',
        status: AttendanceStatus.PRESENT,
        method: 'manual',
      });

      expect(res.success).toBe(true);
      expect(res.isNew).toBe(false);
      expect(existingDoc.save).toHaveBeenCalled();
    });
  });

  describe('getDailyRoster', () => {
    it('returns daily roster with student-module entries and unmarked counts', async () => {
      studentModel.find.mockReturnValue(mockQuery([mockStudent]));
      moduleModel.find.mockReturnValue(mockQuery([mockModule]));
      attendanceModel.find.mockReturnValue(mockQuery([]));

      const res = await service.getDailyRoster({
        date: '2026-11-16',
        moduleId: 'mod_mth_101',
      });

      expect(res.totalEntries).toBe(1);
      expect(res.unmarkedCount).toBe(1);
      expect(res.markedCount).toBe(0);
      expect(res.rows[0].record).toBeNull();
    });
  });

  describe('bulkMarkUnmarked', () => {
    it('marks all unmarked active students for target module as present', async () => {
      studentModel.find.mockReturnValue(mockQuery([mockStudent]));
      attendanceModel.find.mockReturnValue(mockQuery([]));
      attendanceModel.insertMany = vi.fn().mockResolvedValue([mockAttendance]);

      const res = await service.bulkMarkUnmarked({
        date: '2026-11-16',
        moduleId: 'mod_mth_101',
      });

      expect(res.success).toBe(true);
      expect(res.markedCount).toBe(1);
      expect(attendanceModel.insertMany).toHaveBeenCalled();
    });
  });

  describe('getSummaries', () => {
    it('calculates aggregated student summaries and rate over range', async () => {
      studentModel.find.mockReturnValue(mockQuery([mockStudent]));
      attendanceModel.find.mockReturnValue(
        mockQuery([
          { ...mockAttendance, status: AttendanceStatus.PRESENT },
          { ...mockAttendance, status: AttendanceStatus.LATE },
        ]),
      );

      const res = await service.getSummaries({
        from: '2026-11-01',
        to: '2026-11-30',
        moduleId: 'mod_mth_101',
      });

      expect(res.totalStudents).toBe(1);
      expect(res.summaries[0].present).toBe(1);
      expect(res.summaries[0].late).toBe(1);
      expect(res.summaries[0].rate).toBe(100);
      expect(res.overallRate).toBe(100);
    });
  });

  describe('getStudentHistory', () => {
    it('returns student attendance history with populated modules', async () => {
      studentModel.findOne.mockReturnValue(mockQuery(mockStudent));
      attendanceModel.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([mockAttendance]),
      });
      moduleModel.find.mockReturnValue(mockQuery([mockModule]));

      const res = await service.getStudentHistory('STU-2026-001');

      expect(res.student.id).toBe('STU-2026-001');
      expect(res.counts.present).toBe(1);
      expect(res.counts.total).toBe(1);
      expect(res.overallRate).toBe(100);
      expect(res.records[0].module?.name).toBe('Pure Mathematics');
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
