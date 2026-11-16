import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoticePriority, NoticeStatus } from '../enums/status.enum.js';
import { NoticesController } from './notices.controller.js';
import { NoticesService, type NoticeDto } from './notices.service.js';

describe('NoticesController', () => {
  let controller: NoticesController;
  let service: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  const sampleNotice: NoticeDto = {
    id: '6afac0a3a4cde09a5c1d19dc',
    title: 'Term 2 Mock Exam',
    description: 'The Term 2 mock exam has been scheduled.',
    batches: ['2025-A Morning'],
    publishDate: '2026-11-16',
    expiryDate: '2026-11-25',
    priority: NoticePriority.HIGH,
    status: NoticeStatus.PUBLISHED,
  };

  beforeEach(async () => {
    service = {
      findAll: vi.fn().mockResolvedValue([sampleNotice]),
      findOne: vi.fn().mockResolvedValue(sampleNotice),
      create: vi.fn().mockResolvedValue(sampleNotice),
      update: vi.fn().mockResolvedValue(sampleNotice),
      remove: vi.fn().mockResolvedValue({ deleted: true, id: sampleNotice.id }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NoticesController],
      providers: [
        {
          provide: NoticesService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<NoticesController>(NoticesController);
  });

  it('delegates findAll to service.findAll', async () => {
    const res = await controller.findAll();
    expect(res).toEqual([sampleNotice]);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('delegates findOne to service.findOne', async () => {
    const res = await controller.findOne(sampleNotice.id);
    expect(res).toEqual(sampleNotice);
    expect(service.findOne).toHaveBeenCalledWith(sampleNotice.id);
  });

  it('delegates create to service.create', async () => {
    const res = await controller.create(sampleNotice);
    expect(res).toEqual(sampleNotice);
    expect(service.create).toHaveBeenCalledWith(sampleNotice);
  });

  it('delegates update to service.update', async () => {
    const res = await controller.update(sampleNotice.id, { title: 'Updated' });
    expect(res).toEqual(sampleNotice);
    expect(service.update).toHaveBeenCalledWith(sampleNotice.id, { title: 'Updated' });
  });

  it('delegates remove to service.remove', async () => {
    const res = await controller.remove(sampleNotice.id);
    expect(res).toEqual({ deleted: true, id: sampleNotice.id });
    expect(service.remove).toHaveBeenCalledWith(sampleNotice.id);
  });
});
