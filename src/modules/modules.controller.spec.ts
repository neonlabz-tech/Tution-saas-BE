import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModuleStatus } from '../enums/status.enum.js';
import { createModuleSchema } from './dto/create-module.dto.js';
import { moduleQuerySchema } from './dto/module-query.dto.js';
import { syncEnrollmentsSchema } from './dto/sync-enrollments.dto.js';
import { updateModuleSchema } from './dto/update-module.dto.js';
import { ModulesController } from './modules.controller.js';
import { ModulesService } from './modules.service.js';

describe('ModulesController & Zod DTO Schemas', () => {
  let controller: ModulesController;
  let mockModulesService: {
    findAll: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    syncEnrollments: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockModulesService = {
      findAll: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue({ id: 'mod_mth', code: 'MTH-101' }),
      create: vi.fn().mockResolvedValue({ id: 'mod_mth', code: 'MTH-101' }),
      update: vi.fn().mockResolvedValue({ id: 'mod_mth', fee: 75000 }),
      syncEnrollments: vi.fn().mockResolvedValue({ moduleId: 'mod_mth', enrolledCount: 2 }),
      remove: vi.fn().mockResolvedValue({ deleted: true, id: 'mod_mth' }),
    };

    controller = new ModulesController(mockModulesService as unknown as ModulesService);
  });

  describe('controller delegation', () => {
    it('delegates findAll, findOne, create, update, syncEnrollments, and remove to ModulesService', async () => {
      const query = moduleQuerySchema.parse({ q: 'math' });
      await controller.findAll(query);
      expect(mockModulesService.findAll).toHaveBeenCalledWith(query);

      await controller.findOne('mod_mth');
      expect(mockModulesService.findOne).toHaveBeenCalledWith('mod_mth');

      const createDto = createModuleSchema.parse({
        code: 'mth-101',
        name: 'Advanced Mathematics',
        description: 'Calculus, algebra and structured problem-solving.',
        fee: 72000,
        duration: '6 months',
        batches: ['2025-A Morning'],
      });
      await controller.create(createDto);
      expect(mockModulesService.create).toHaveBeenCalledWith(createDto);

      const updateDto = updateModuleSchema.parse({ fee: 75000 });
      await controller.update('mod_mth', updateDto);
      expect(mockModulesService.update).toHaveBeenCalledWith('mod_mth', updateDto);

      const syncDto = syncEnrollmentsSchema.parse({
        studentIds: ['STU-001', 'STU-002'],
      });
      await controller.syncEnrollments('mod_mth', syncDto);
      expect(mockModulesService.syncEnrollments).toHaveBeenCalledWith('mod_mth', syncDto);

      await controller.remove('mod_mth');
      expect(mockModulesService.remove).toHaveBeenCalledWith('mod_mth');
    });
  });

  describe('DTO schemas validation', () => {
    it('normalizes module code to uppercase and applies default status to active', () => {
      const parsed = createModuleSchema.parse({
        code: '  phy-102  ',
        name: 'Physics',
        description: 'Mechanics, waves, electricity and modern physics.',
        fee: 68000,
        duration: '6 months',
        batches: ['2025-A Morning', '2025-A Morning'],
      });

      expect(parsed.code).toBe('PHY-102');
      expect(parsed.status).toBe(ModuleStatus.ACTIVE);
      expect(parsed.batches).toEqual(['2025-A Morning']);
      expect(parsed.teacherId).toBeNull();
    });

    it('rejects createModule with fee under 1000', () => {
      expect(() =>
        createModuleSchema.parse({
          code: 'PHY-102',
          name: 'Physics',
          description: 'Mechanics, waves, electricity and modern physics.',
          fee: 500,
          duration: '6 months',
          batches: ['2025-A Morning'],
        }),
      ).toThrow();
    });

    it('rejects createModule with empty batches array', () => {
      expect(() =>
        createModuleSchema.parse({
          code: 'PHY-102',
          name: 'Physics',
          description: 'Mechanics, waves, electricity and modern physics.',
          fee: 68000,
          duration: '6 months',
          batches: [],
        }),
      ).toThrow();
    });

    it('rejects updateModule with empty batches array', () => {
      expect(() =>
        updateModuleSchema.parse({
          batches: [],
        }),
      ).toThrow();
    });

    it('deduplicates studentIds in syncEnrollmentsSchema', () => {
      const parsed = syncEnrollmentsSchema.parse({
        studentIds: ['STU-001', 'STU-002', 'STU-001'],
      });

      expect(parsed.studentIds).toEqual(['STU-001', 'STU-002']);
    });
  });
});
