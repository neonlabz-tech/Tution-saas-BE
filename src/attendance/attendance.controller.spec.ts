import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceStatus } from '../enums/status.enum.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      verifyQr: vi.fn(),
      markQrAttendance: vi.fn(),
      markManualAttendance: vi.fn(),
      upsertAttendance: vi.fn(),
      getDailyRoster: vi.fn(),
      getSummaries: vi.fn(),
      bulkMarkUnmarked: vi.fn(),
      getStudentHistory: vi.fn(),
      findAll: vi.fn(),
      findById: vi.fn(),
      getStats: vi.fn(),
      delete: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [
        {
          provide: AttendanceService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  it('delegates verifyQrPost to service.verifyQr', async () => {
    const dto = { code: 'EDUFLOW:123', moduleId: 'mod_1' };
    service.verifyQr.mockResolvedValue({ valid: true });
    const res = await controller.verifyQrPost(dto);
    expect(service.verifyQr).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ valid: true });
  });

  it('delegates verifyQrGet to service.verifyQr', async () => {
    const query = { code: 'EDUFLOW:123' };
    service.verifyQr.mockResolvedValue({ valid: true });
    const res = await controller.verifyQrGet(query);
    expect(service.verifyQr).toHaveBeenCalledWith(query);
    expect(res).toEqual({ valid: true });
  });

  it('delegates markQrAttendance to service.markQrAttendance', async () => {
    const dto = {
      code: 'EDUFLOW:123',
      moduleId: 'mod_1',
      status: AttendanceStatus.PRESENT,
    };
    service.markQrAttendance.mockResolvedValue({ success: true });
    const res = await controller.markQrAttendance(dto);
    expect(service.markQrAttendance).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ success: true });
  });

  it('delegates markManualAttendance to service.markManualAttendance', async () => {
    const dto = {
      studentId: 'STU-001',
      moduleId: 'mod_1',
      date: '2026-11-16',
      status: AttendanceStatus.PRESENT,
    };
    service.markManualAttendance.mockResolvedValue({ success: true });
    const res = await controller.markManualAttendance(dto);
    expect(service.markManualAttendance).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ success: true });
  });

  it('delegates findAll to service.findAll', async () => {
    service.findAll.mockResolvedValue([]);
    const res = await controller.findAll({ date: '2026-11-16' });
    expect(service.findAll).toHaveBeenCalledWith({ date: '2026-11-16' });
    expect(res).toEqual([]);
  });

  it('delegates getStats to service.getStats', async () => {
    service.getStats.mockResolvedValue({ rate: 85 });
    const res = await controller.getStats('2026-11-16', 'mod_1');
    expect(service.getStats).toHaveBeenCalledWith('2026-11-16', 'mod_1');
    expect(res).toEqual({ rate: 85 });
  });

  it('delegates upsertAttendancePost to service.upsertAttendance', async () => {
    const dto = {
      studentId: 'STU-001',
      moduleId: 'mod_1',
      date: '2026-11-16',
      status: AttendanceStatus.PRESENT,
    };
    service.upsertAttendance.mockResolvedValue({ success: true });
    const res = await controller.upsertAttendancePost(dto);
    expect(service.upsertAttendance).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ success: true });
  });

  it('delegates getDailyRoster to service.getDailyRoster', async () => {
    const query = { date: '2026-11-16', moduleId: 'mod_1' };
    service.getDailyRoster.mockResolvedValue({ totalEntries: 1 });
    const res = await controller.getDailyRoster(query);
    expect(service.getDailyRoster).toHaveBeenCalledWith(query);
    expect(res).toEqual({ totalEntries: 1 });
  });

  it('delegates getSummaries to service.getSummaries', async () => {
    const query = { from: '2026-11-01', to: '2026-11-30' };
    service.getSummaries.mockResolvedValue({ totalStudents: 1 });
    const res = await controller.getSummaries(query);
    expect(service.getSummaries).toHaveBeenCalledWith(query);
    expect(res).toEqual({ totalStudents: 1 });
  });

  it('delegates bulkMarkUnmarkedPost to service.bulkMarkUnmarked', async () => {
    const dto = { date: '2026-11-16', moduleId: 'mod_1' };
    service.bulkMarkUnmarked.mockResolvedValue({ markedCount: 5 });
    const res = await controller.bulkMarkUnmarkedPost(dto);
    expect(service.bulkMarkUnmarked).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ markedCount: 5 });
  });

  it('delegates getStudentHistory to service.getStudentHistory', async () => {
    service.getStudentHistory.mockResolvedValue({ overallRate: 95 });
    const res = await controller.getStudentHistory('STU-001', {});
    expect(service.getStudentHistory).toHaveBeenCalledWith('STU-001', {});
    expect(res).toEqual({ overallRate: 95 });
  });

  it('delegates delete to service.delete', async () => {
    service.delete.mockResolvedValue({ deleted: true, id: 'att_1' });
    const res = await controller.delete('att_1');
    expect(service.delete).toHaveBeenCalledWith('att_1');
    expect(res).toEqual({ deleted: true, id: 'att_1' });
  });
});
