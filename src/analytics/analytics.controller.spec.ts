import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { ModuleStatus } from '../enums/status.enum.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getOverview: vi.fn().mockResolvedValue({ kpis: {} }),
      getModulePerformance: vi.fn().mockResolvedValue({ items: [] }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: service }],
    }).compile();

    controller = moduleRef.get(AnalyticsController);
  });

  it('restricts AnalyticsController to ADMIN and SUPER_ADMIN roles', () => {
    const reflector = new Reflector();
    const roles = reflector.get<Role[]>(ROLES_KEY, AnalyticsController);
    expect(roles).toEqual([Role.ADMIN, Role.SUPER_ADMIN]);
  });

  it('delegates getOverview to AnalyticsService', async () => {
    const query = { period: 'month' as const, batch: '2026-A Morning' };
    await controller.getOverview(query);
    expect(service.getOverview).toHaveBeenCalledWith(query);
  });

  it('delegates getModulePerformance to AnalyticsService', async () => {
    const query = { period: 'year' as const, status: ModuleStatus.ACTIVE };
    await controller.getModulePerformance(query);
    expect(service.getModulePerformance).toHaveBeenCalledWith(query);
  });
});
