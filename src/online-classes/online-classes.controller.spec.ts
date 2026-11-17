import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassStatus } from '../enums/status.enum.js';
import { OnlineClassesController } from './online-classes.controller.js';
import { OnlineClassesService } from './online-classes.service.js';
import type { OnlineClass } from './schemas/online-class.schema.js';

describe('OnlineClassesController', () => {
  let controller: OnlineClassesController;
  let service: {
    findAll: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
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
    description: '',
    status: ClassStatus.SCHEDULED,
  };

  beforeEach(async () => {
    service = {
      findAll: vi.fn().mockResolvedValue([sampleClass]),
      findById: vi.fn().mockResolvedValue(sampleClass),
      create: vi.fn().mockResolvedValue(sampleClass),
      update: vi.fn().mockResolvedValue(sampleClass),
      delete: vi.fn().mockResolvedValue({ deleted: true, id: 'cls_1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnlineClassesController],
      providers: [
        {
          provide: OnlineClassesService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<OnlineClassesController>(OnlineClassesController);
  });

  it('delegates getAllClasses to service.findAll', async () => {
    const res = await controller.getAllClasses({ teacherId: 'tea_1' });
    expect(res).toEqual([sampleClass]);
    expect(service.findAll).toHaveBeenCalledWith({ teacherId: 'tea_1' });
  });

  it('delegates getClassById to service.findById', async () => {
    const res = await controller.getClassById('cls_1');
    expect(res).toEqual(sampleClass);
    expect(service.findById).toHaveBeenCalledWith('cls_1');
  });

  it('delegates createClass to service.create', async () => {
    const dto = {
      title: 'Pure Maths',
      moduleId: 'mod_mth',
      teacherId: 'tea_1',
      batch: '2025-A Morning',
      start: '2026-11-20T09:00',
      end: '2026-11-20T10:30',
      link: 'https://meet.google.com/abc',
    };
    const res = await controller.createClass(dto);
    expect(res).toEqual(sampleClass);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('delegates updateClass to service.update', async () => {
    const patchDto = { title: 'Updated Title' };
    const res = await controller.updateClass('cls_1', patchDto);
    expect(res).toEqual(sampleClass);
    expect(service.update).toHaveBeenCalledWith('cls_1', patchDto);
  });

  it('delegates deleteClass to service.delete', async () => {
    const res = await controller.deleteClass('cls_1');
    expect(res).toEqual({ deleted: true, id: 'cls_1' });
    expect(service.delete).toHaveBeenCalledWith('cls_1');
  });
});
