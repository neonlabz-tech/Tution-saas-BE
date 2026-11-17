import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassStatus } from '../enums/status.enum.js';
import { Notification } from '../notifications/schemas/notification.schema.js';
import { OnlineClassesService } from './online-classes.service.js';
import { OnlineClass } from './schemas/online-class.schema.js';

describe('OnlineClassesService', () => {
  let service: OnlineClassesService;
  let onlineClassModel: {
    find: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    deleteOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let notificationModel: {
    create: ReturnType<typeof vi.fn>;
  };

  const sampleClass: OnlineClass = {
    id: 'cls_1',
    title: 'Pure Maths — Integration',
    moduleId: 'mod_mth',
    teacherId: 'tea_1',
    batch: '2025-A Morning',
    start: '2026-11-20T09:00',
    end: '2026-11-20T10:30',
    link: 'https://meet.google.com/abc-defg-hij',
    description: 'Calculus and integration methods',
    status: ClassStatus.SCHEDULED,
  };

  beforeEach(async () => {
    onlineClassModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      deleteOne: vi.fn(),
      create: vi.fn().mockImplementation((dto) =>
        Promise.resolve({
          ...dto,
          toObject: () => ({ ...dto }),
        }),
      ),
    };

    notificationModel = {
      create: vi.fn().mockResolvedValue({ id: 'notif_1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnlineClassesService,
        {
          provide: getModelToken(OnlineClass.name),
          useValue: onlineClassModel,
        },
        {
          provide: getModelToken(Notification.name),
          useValue: notificationModel,
        },
      ],
    }).compile();

    service = module.get<OnlineClassesService>(OnlineClassesService);
  });

  describe('findAll', () => {
    it('fetches all online classes sorted by start date/time', async () => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([sampleClass]),
      };
      onlineClassModel.find.mockReturnValue(mockQuery);

      const res = await service.findAll();
      expect(onlineClassModel.find).toHaveBeenCalledWith({});
      expect(mockQuery.sort).toHaveBeenCalledWith({ start: 1 });
      expect(res).toEqual([sampleClass]);
    });

    it('filters by teacher, module, batch, status and search query', async () => {
      const mockQuery = {
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([sampleClass]),
      };
      onlineClassModel.find.mockReturnValue(mockQuery);

      await service.findAll({
        teacherId: 'tea_1',
        moduleId: 'mod_mth',
        batch: '2025-A Morning',
        status: ClassStatus.SCHEDULED,
        q: 'Integration',
      });

      expect(onlineClassModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          teacherId: 'tea_1',
          moduleId: 'mod_mth',
          batch: '2025-A Morning',
          status: ClassStatus.SCHEDULED,
          $or: expect.any(Array),
        }),
      );
    });
  });

  describe('findById', () => {
    it('returns the online class if found', async () => {
      const mockQuery = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(sampleClass),
      };
      onlineClassModel.findOne.mockReturnValue(mockQuery);

      const res = await service.findById('cls_1');
      expect(res).toEqual(sampleClass);
    });

    it('throws NotFoundException when class does not exist', async () => {
      const mockQuery = {
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue(null),
      };
      onlineClassModel.findOne.mockReturnValue(mockQuery);

      await expect(service.findById('missing_cls')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create (Schedule Online Class)', () => {
    it('schedules a new class and triggers a notification', async () => {
      const dto = {
        title: 'Physics — Wave Mechanics',
        moduleId: 'mod_phy',
        teacherId: 'tea_2',
        batch: '2025-B Evening',
        start: '2026-11-21T14:00',
        end: '2026-11-21T15:30',
        link: 'https://meet.google.com/xyz-1234-abc',
      };

      const res = await service.create(dto);
      expect(res.id).toMatch(/^cls_\d+_/);
      expect(res.title).toBe(dto.title);
      expect(res.status).toBe('scheduled');
      expect(notificationModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'class',
          title: expect.stringContaining('Class Scheduled: Physics'),
        }),
      );
    });

    it('throws BadRequestException when start time is on or after end time', async () => {
      const dto = {
        title: 'Chemistry Lab Session',
        moduleId: 'mod_chm',
        teacherId: 'tea_1',
        batch: '2025-A Morning',
        start: '2026-11-21T16:00',
        end: '2026-11-21T15:00', // invalid!
        link: 'https://meet.google.com/chm-test',
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update / reschedule', () => {
    it('updates class details and reschedules time', async () => {
      const mockDoc = {
        ...sampleClass,
        save: vi.fn().mockImplementation(function (this: typeof sampleClass) {
          return Promise.resolve({
            ...this,
            toObject: () => ({ ...this }),
          });
        }),
      };

      onlineClassModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDoc),
      });

      const updated = await service.update('cls_1', {
        title: 'Pure Maths — Advanced Integration',
        start: '2026-11-20T10:00',
        end: '2026-11-20T11:30',
      });

      expect(updated.title).toBe('Pure Maths — Advanced Integration');
      expect(updated.start).toBe('2026-11-20T10:00');
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it('throws BadRequestException when rescheduling with start >= end', async () => {
      const mockDoc = {
        ...sampleClass,
        save: vi.fn(),
      };

      onlineClassModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDoc),
      });

      await expect(
        service.update('cls_1', {
          start: '2026-11-20T12:00',
          end: '2026-11-20T11:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when updating non-existent class', async () => {
      onlineClassModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('non_existent', { title: 'New' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes class by ID', async () => {
      onlineClassModel.deleteOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ deletedCount: 1 }),
      });

      const res = await service.delete('cls_1');
      expect(res).toEqual({ deleted: true, id: 'cls_1' });
      expect(onlineClassModel.deleteOne).toHaveBeenCalledWith({ id: 'cls_1' });
    });

    it('throws NotFoundException when deleting missing class', async () => {
      onlineClassModel.deleteOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      });

      await expect(service.delete('missing_cls')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
