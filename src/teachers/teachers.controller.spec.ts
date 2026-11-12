import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { SortDirection } from '../enums/sort-direction.enum.js';
import { TeacherStatus } from '../enums/status.enum.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

describe('TeachersController', () => {
  let controller: TeachersController;
  let service: {
    getAllTeachers: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      getAllTeachers: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachersController],
      providers: [{ provide: TeachersService, useValue: service }],
    }).compile();

    controller = module.get<TeachersController>(TeachersController);
  });

  it('delegates getAllTeachers to TeachersService', async () => {
    const payload = {
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 0,
      data: [],
      metrics: {
        totalTeachers: 0,
        activeTeachers: 0,
        weeklyTeachingHours: 0,
        teachersWithoutModules: 0,
      },
    };
    service.getAllTeachers.mockResolvedValue(payload);

    const result = await controller.getAllTeachers(
      10,
      1,
      'createdAt',
      SortDirection.Descending,
      undefined,
      TeacherStatus.ACTIVE,
      'mod_mth',
      '2025-A Morning',
      'anura',
    );

    expect(service.getAllTeachers).toHaveBeenCalledWith(
      10,
      1,
      'createdAt',
      SortDirection.Descending,
      undefined,
      TeacherStatus.ACTIVE,
      'mod_mth',
      '2025-A Morning',
      'anura',
    );
    expect(result).toBe(payload);
  });

  it('delegates findOne to TeachersService', async () => {
    const profile = { id: 'TCH-001', fullName: 'Dr. Anura Wijesekara' };
    service.findOne.mockResolvedValue(profile);

    const result = await controller.findOne('TCH-001');

    expect(service.findOne).toHaveBeenCalledWith('TCH-001');
    expect(result).toBe(profile);
  });

  it('delegates create to TeachersService', async () => {
    const dto = {
      fullName: 'Dr. Anura Wijesekara',
      email: 'anura.w@eduflow.lk',
      phone: '0771234501',
      qualification: 'PhD in Mathematics',
      specialization: 'Calculus & Algebra',
      batches: ['2025-A Morning'],
      joiningDate: '2019-02-11',
      status: TeacherStatus.ACTIVE,
      moduleIds: ['mod_mth'],
    };
    const created = { id: 'TCH-001', ...dto };
    service.create.mockResolvedValue(created);

    const result = await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
    expect(result).toBe(created);
  });

  it('delegates update to TeachersService', async () => {
    const dto = { specialization: 'Linear Algebra', moduleIds: ['mod_mth'] };
    const updated = { id: 'TCH-001', ...dto };
    service.update.mockResolvedValue(updated);

    const result = await controller.update('TCH-001', dto);

    expect(service.update).toHaveBeenCalledWith('TCH-001', dto);
    expect(result).toBe(updated);
  });

  it('delegates remove to TeachersService', async () => {
    const deleted = {
      deleted: true,
      id: 'TCH-001',
      unassignedModulesCount: 1,
      deletedClassesCount: 2,
    };
    service.remove.mockResolvedValue(deleted);

    const result = await controller.remove('TCH-001');

    expect(service.remove).toHaveBeenCalledWith('TCH-001');
    expect(result).toBe(deleted);
  });
});
