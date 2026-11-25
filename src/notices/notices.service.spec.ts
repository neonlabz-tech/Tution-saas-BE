import {
  BadRequestException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NoticePriority,
  NoticeState,
  NoticeStatus,
} from '../enums/status.enum.js';
import { Counter } from '../students/schemas/counter.schema.js';
import {
  computeNoticeState,
  NoticesService,
  todayISO,
} from './notices.service.js';
import { R2StorageService } from './r2-storage.service.js';
import { Notice } from './schemas/notice.schema.js';

const TODAY = '2026-11-20';

const chain = <T>(value: T) => ({
  sort: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue(value),
});

describe('NoticesService', () => {
  let service: NoticesService;
  let noticeModel: Record<string, ReturnType<typeof vi.fn>>;
  let counterModel: { findOneAndUpdate: ReturnType<typeof vi.fn> };
  let r2Storage: Record<string, ReturnType<typeof vi.fn>>;

  const sample: Notice = {
    id: 'NTC-001',
    title: 'Class cancelled',
    description: 'Physics class at 4 PM is cancelled.',
    allBatches: false,
    batches: ['2025-A Morning'],
    publishDate: '2026-11-18',
    expiryDate: '2026-11-25',
    priority: NoticePriority.HIGH,
    status: NoticeStatus.PUBLISHED,
  };

  const validDto = {
    title: 'Holiday notice',
    description: 'Institute closed on Monday for Deepavali.',
    allBatches: true,
    publishDate: '2026-11-20',
    expiryDate: '2026-11-24',
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 9, 0, 0));

    noticeModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      deleteOne: vi.fn(),
      countDocuments: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(1) }),
      createIndexes: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockImplementation((doc) =>
        Promise.resolve({ ...doc, toObject: () => ({ ...doc }) }),
      ),
    };
    counterModel = {
      findOneAndUpdate: vi.fn().mockReturnValue(chain({ _id: 'notice', seq: 7 })),
    };
    r2Storage = {
      uploadObject: vi.fn().mockResolvedValue(undefined),
      deleteObject: vi.fn().mockResolvedValue(undefined),
      getPresignedDownloadUrl: vi
        .fn()
        .mockResolvedValue('https://r2.example.com/signed-url'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoticesService,
        { provide: getModelToken(Notice.name), useValue: noticeModel },
        { provide: getModelToken(Counter.name), useValue: counterModel },
        { provide: R2StorageService, useValue: r2Storage },
      ],
    }).compile();

    service = module.get(NoticesService);
  });

  afterEach(() => vi.useRealTimers());

  describe('computeNoticeState', () => {
    it.each([
      [{ status: NoticeStatus.DRAFT, publishDate: '2026-11-01', expiryDate: '2026-11-30' }, NoticeState.DRAFT],
      [{ status: NoticeStatus.PUBLISHED, publishDate: '2026-11-21', expiryDate: '2026-11-30' }, NoticeState.SCHEDULED],
      [{ status: NoticeStatus.PUBLISHED, publishDate: '2026-11-01', expiryDate: '2026-11-19' }, NoticeState.EXPIRED],
      [{ status: NoticeStatus.PUBLISHED, publishDate: '2026-11-20', expiryDate: '2026-11-20' }, NoticeState.ACTIVE],
    ])('%o -> %s', (notice, expected) => {
      expect(computeNoticeState(notice, TODAY)).toBe(expected);
    });

    it('uses local system date for today', () => {
      expect(todayISO()).toBe(TODAY);
    });
  });

  describe('findAll', () => {
    it('returns items with computed state and counts', async () => {
      const q = chain([sample]);
      noticeModel.find.mockReturnValue(q);

      const res = await service.findAll();

      expect(noticeModel.find).toHaveBeenCalledWith({});
      expect(q.sort).toHaveBeenCalledWith({ publishDate: -1, createdAt: -1 });
      expect(res.items[0]).toMatchObject({ id: 'NTC-001', state: NoticeState.ACTIVE });
      expect(res.counts).toEqual({ all: 1, draft: 1, scheduled: 1, active: 1 });
    });

    it('applies state, priority, batch and escaped search filters', async () => {
      noticeModel.find.mockReturnValue(chain([]));

      await service.findAll({
        state: NoticeState.ACTIVE,
        priority: NoticePriority.HIGH,
        batch: '2025-A Morning',
        q: 'a+b',
      });

      const filter = noticeModel.find.mock.calls[0][0];
      expect(filter.$and).toEqual([
        { priority: NoticePriority.HIGH },
        {
          $or: [
            { allBatches: true },
            { batches: { $size: 0 } },
            { batches: '2025-A Morning' },
          ],
        },
        { $or: [{ title: /a\+b/i }, { description: /a\+b/i }] },
        {
          status: NoticeStatus.PUBLISHED,
          publishDate: { $lte: TODAY },
          $or: [
            { expiresAt: { $gt: new Date(2026, 10, 20, 9, 0, 0) } },
            { expiresAt: { $exists: false }, expiryDate: { $gte: TODAY } },
            { expiresAt: null, expiryDate: { $gte: TODAY } },
          ],
        },
      ]);
    });

    it('forces active-only for non-admin viewers', async () => {
      noticeModel.find.mockReturnValue(chain([]));

      const res = await service.findAll({ state: NoticeState.DRAFT }, { activeOnly: true });

      expect(noticeModel.find.mock.calls[0][0].$and).toEqual([
        {
          status: NoticeStatus.PUBLISHED,
          publishDate: { $lte: TODAY },
          $or: [
            { expiresAt: { $gt: new Date(2026, 10, 20, 9, 0, 0) } },
            { expiresAt: { $exists: false }, expiryDate: { $gte: TODAY } },
            { expiresAt: null, expiryDate: { $gte: TODAY } },
          ],
        },
      ]);
      expect(res.counts).toEqual({ all: 1, draft: 0, scheduled: 0, active: 1 });
    });

    it('treats legacy notices with empty batches as all batches', async () => {
      noticeModel.find.mockReturnValue(chain([{ ...sample, allBatches: undefined, batches: [] }]));
      const res = await service.findAll();
      expect(res.items[0].allBatches).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns the notice', async () => {
      noticeModel.findOne.mockReturnValue(chain(sample));
      await expect(service.findById('NTC-001')).resolves.toMatchObject({ id: 'NTC-001' });
    });

    it('throws 404 when missing', async () => {
      noticeModel.findOne.mockReturnValue(chain(null));
      await expect(service.findById('NTC-999')).rejects.toThrow(NotFoundException);
    });

    it('returns expired notices to admins but hides them from other portals', async () => {
      const expired = { ...sample, publishDate: '2026-11-01', expiryDate: '2026-11-10' };
      noticeModel.findOne.mockReturnValue(chain(expired));
      await expect(service.findById('NTC-001')).resolves.toMatchObject({ state: NoticeState.EXPIRED });
      noticeModel.findOne.mockReturnValue(chain(expired));
      await expect(service.findById('NTC-001', { activeOnly: true })).rejects.toThrow(NotFoundException);
    });

    it('hides drafts from non-admin viewers', async () => {
      noticeModel.findOne.mockReturnValue(chain({ ...sample, status: NoticeStatus.DRAFT }));
      await expect(service.findById('NTC-001', { activeOnly: true })).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('generates NTC-xxx id and applies defaults', async () => {
      const res = await service.create(validDto);

      expect(res).toMatchObject({
        id: 'NTC-007',
        allBatches: true,
        batches: [],
        priority: NoticePriority.MEDIUM,
        status: NoticeStatus.PUBLISHED,
        state: NoticeState.ACTIVE,
      });
    });

    it('clears batches when allBatches is true', async () => {
      const res = await service.create({ ...validDto, batches: ['X'] });
      expect(res.batches).toEqual([]);
    });

    it('requires batches when not all batches', async () => {
      await expect(
        service.create({ ...validDto, allBatches: false, batches: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects expiry before publish', async () => {
      await expect(
        service.create({ ...validDto, publishDate: '2026-11-25', expiryDate: '2026-11-22' }),
      ).rejects.toThrow('Expiry date must be on or after the publish date');
    });

    it('rejects impossible calendar dates', async () => {
      await expect(
        service.create({ ...validDto, expiryDate: '2026-02-31' }),
      ).rejects.toThrow('Expiry date is not a valid calendar date');
    });

    it('rejects publish date in the past', async () => {
      await expect(
        service.create({ ...validDto, publishDate: '2026-11-01', expiryDate: '2026-11-10' }),
      ).rejects.toThrow('Publish date cannot be in the past');
    });
  });

  describe('update', () => {
    const existingDoc = () => {
      const doc: Record<string, unknown> = { ...sample };
      doc.save = vi.fn().mockImplementation(() =>
        Promise.resolve({ toObject: () => ({ ...doc }) }),
      );
      return doc;
    };

    it('updates fields and switches to all batches', async () => {
      const doc = existingDoc();
      noticeModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc) });

      const res = await service.update('NTC-001', { title: 'New title', allBatches: true });

      expect(res).toMatchObject({ title: 'New title', allBatches: true, batches: [] });
    });

    it('validates merged dates', async () => {
      noticeModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(existingDoc()) });
      await expect(
        service.update('NTC-001', { publishDate: '2026-11-30' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 404 when missing', async () => {
      noticeModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
      await expect(service.update('NTC-404', { title: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('backfillLegacyNotices / onModuleInit', () => {
    it('assigns ids oldest-first, sets allBatches, then creates indexes', async () => {
      const order: string[] = [];
      noticeModel.find.mockReturnValue(chain([{ _id: 'a' }, { _id: 'b' }]));
      noticeModel.updateOne = vi.fn().mockImplementation(() => ({
        exec: vi.fn().mockImplementation(async () => { order.push('updateOne'); }),
      }));
      noticeModel.updateMany = vi.fn()
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) })
        .mockReturnValueOnce({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) });
      noticeModel.createIndexes.mockImplementation(async () => { order.push('createIndexes'); });
      counterModel.findOneAndUpdate
        .mockReturnValueOnce(chain({ seq: 7 }))
        .mockReturnValueOnce(chain({ seq: 8 }));

      await service.onModuleInit();

      expect(noticeModel.find.mock.results[0].value.sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(noticeModel.updateOne).toHaveBeenNthCalledWith(1, { _id: 'a' }, { $set: { id: 'NTC-007' } });
      expect(noticeModel.updateOne).toHaveBeenNthCalledWith(2, { _id: 'b' }, { $set: { id: 'NTC-008' } });
      expect(noticeModel.updateMany.mock.calls[0][1]).toEqual({ $set: { allBatches: true, batches: [] } });
      expect(noticeModel.updateMany.mock.calls[1][1]).toEqual({ $set: { allBatches: false } });
      expect(order.at(-1)).toBe('createIndexes');
    });

    it('does nothing when there is no legacy data', async () => {
      noticeModel.find.mockReturnValue(chain([]));
      noticeModel.updateOne = vi.fn();
      noticeModel.updateMany = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) });

      await expect(service.backfillLegacyNotices()).resolves.toEqual({ ids: 0, allBatches: 0 });
      expect(noticeModel.updateOne).not.toHaveBeenCalled();
      expect(counterModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('hard deletes the notice and deletes R2 attachment if present', async () => {
      noticeModel.findOne.mockReturnValue(
        chain({
          ...sample,
          attachment: {
            key: 'notices/NTC-001/uuid-timetable.pdf',
            fileName: 'timetable.pdf',
            mimeType: 'application/pdf',
            size: 1024,
            uploadedAt: new Date(),
          },
        }),
      );
      noticeModel.deleteOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({ deletedCount: 1 }) });
      await expect(service.delete('NTC-001')).resolves.toEqual({ deleted: true, id: 'NTC-001' });
      expect(r2Storage.deleteObject).toHaveBeenCalledWith('notices/NTC-001/uuid-timetable.pdf');
      expect(noticeModel.deleteOne).toHaveBeenCalledWith({ id: 'NTC-001' });
    });

    it('throws 404 when notice does not exist', async () => {
      noticeModel.findOne.mockReturnValue(chain(null));
      await expect(service.delete('NTC-404')).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachments & exact expiry', () => {
    it('computes EXPIRED once exact expiresAt timestamp is reached', () => {
      const notice = {
        status: NoticeStatus.PUBLISHED,
        publishDate: '2026-11-20',
        expiryDate: '2026-11-20',
        expiryTime: '09:00',
        expiresAt: new Date(2026, 10, 20, 9, 0, 0),
      };
      expect(computeNoticeState(notice, new Date(2026, 10, 20, 8, 59, 59))).toBe(NoticeState.ACTIVE);
      expect(computeNoticeState(notice, new Date(2026, 10, 20, 9, 0, 0))).toBe(NoticeState.EXPIRED);
    });

    it('uploads attachment to R2, replaces old key, and saves metadata', async () => {
      const doc = {
        ...sample,
        expiresAt: new Date(2026, 10, 25, 23, 59, 0),
        attachment: {
          key: 'notices/NTC-001/old.pdf',
          fileName: 'old.pdf',
          mimeType: 'application/pdf',
          size: 500,
          uploadedAt: new Date(),
        },
        attachmentExpired: false,
        save: vi.fn().mockImplementation(async function (this: Record<string, unknown>) {
          return { toObject: () => ({ ...this }) };
        }),
      };
      noticeModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(doc) });

      const res = await service.uploadAttachment('NTC-001', {
        originalname: 'Exam Timetable.pdf',
        mimetype: 'application/pdf',
        size: 2048,
        buffer: Buffer.from('%PDF-1.4'),
      });

      expect(r2Storage.deleteObject).toHaveBeenCalledWith('notices/NTC-001/old.pdf');
      expect(r2Storage.uploadObject).toHaveBeenCalledWith(
        expect.stringMatching(/^notices\/NTC-001\/.+-Exam_Timetable\.pdf$/),
        expect.any(Buffer),
        'application/pdf',
      );
      expect(res.attachment?.fileName).toBe('Exam Timetable.pdf');
      expect(res.attachmentExpired).toBe(false);
    });

    it('rejects attachment upload with 400 when notice is already expired', async () => {
      noticeModel.findOne.mockReturnValue({
        exec: vi.fn().mockResolvedValue({
          ...sample,
          expiryDate: '2026-11-20',
          expiresAt: new Date(2026, 10, 20, 8, 0, 0),
        }),
      });

      await expect(
        service.uploadAttachment('NTC-001', {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: 100,
          buffer: Buffer.from('pdf'),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns presigned URL for valid attachment and 410 Gone after expiry', async () => {
      const activeDoc = {
        ...sample,
        expiresAt: new Date(2026, 10, 25, 23, 59, 0),
        attachment: {
          key: 'notices/NTC-001/tt.pdf',
          fileName: 'tt.pdf',
          mimeType: 'application/pdf',
          size: 100,
          uploadedAt: new Date(),
        },
        attachmentExpired: false,
      };
      noticeModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(activeDoc) });

      const res = await service.getAttachmentDownload('NTC-001', { activeOnly: true });
      expect(res).toEqual({
        url: 'https://r2.example.com/signed-url',
        fileName: 'tt.pdf',
      });
      expect(r2Storage.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'notices/NTC-001/tt.pdf',
        'tt.pdf',
        60,
      );

      const expiredDoc = {
        ...activeDoc,
        expiresAt: new Date(2026, 10, 20, 8, 0, 0),
        save: vi.fn().mockResolvedValue(undefined),
      };
      noticeModel.findOne.mockReturnValue({ exec: vi.fn().mockResolvedValue(expiredDoc) });

      await expect(
        service.getAttachmentDownload('NTC-001', { activeOnly: true }),
      ).rejects.toThrow(GoneException);
      expect(r2Storage.deleteObject).toHaveBeenCalledWith('notices/NTC-001/tt.pdf');
      expect(expiredDoc.attachment).toBeNull();
      expect(expiredDoc.attachmentExpired).toBe(true);
    });

    it('cron cleanup removes expired attachments from R2 and marks attachmentExpired=true', async () => {
      noticeModel.find.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        lean: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          {
            _id: 'mongo-id-1',
            id: 'NTC-001',
            attachment: { key: 'notices/NTC-001/a.pdf' },
          },
        ]),
      });
      noticeModel.updateOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      });

      const cleaned = await service.cleanupExpiredAttachments();

      expect(cleaned).toBe(1);
      expect(r2Storage.deleteObject).toHaveBeenCalledWith('notices/NTC-001/a.pdf');
      expect(noticeModel.updateOne).toHaveBeenCalledWith(
        { _id: 'mongo-id-1' },
        { $set: { attachment: null, attachmentExpired: true } },
      );
    });
  });
});
