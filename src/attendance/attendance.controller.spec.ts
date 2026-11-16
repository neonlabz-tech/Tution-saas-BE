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

  it('delegates delete to service.delete', async () => {
    service.delete.mockResolvedValue({ deleted: true, id: 'att_1' });
    const res = await controller.delete('att_1');
    expect(service.delete).toHaveBeenCalledWith('att_1');
    expect(res).toEqual({ deleted: true, id: 'att_1' });
  });
});
