import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { Role } from '../enums/role.enum.js';
import { TxType } from '../enums/status.enum.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';

describe('FinanceController', () => {
  let controller: FinanceController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getTransactions: vi.fn().mockResolvedValue({ items: [] }),
      getKpis: vi.fn().mockResolvedValue({ kpis: {} }),
      getCharts: vi.fn().mockResolvedValue({ series: [] }),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [FinanceController],
      providers: [{ provide: FinanceService, useValue: service }],
    }).compile();

    controller = moduleRef.get(FinanceController);
  });

  it('restricts FinanceController to ADMIN and SUPER_ADMIN roles', () => {
    const reflector = new Reflector();
    const roles = reflector.get<Role[]>(ROLES_KEY, FinanceController);
    expect(roles).toEqual([Role.ADMIN, Role.SUPER_ADMIN]);
  });

  it('delegates getTransactions to FinanceService', async () => {
    const query = {
      period: 'month' as const,
      type: TxType.INCOME,
      page: 1,
      limit: 20,
    };
    await controller.getTransactions(query);
    expect(service.getTransactions).toHaveBeenCalledWith(query);
  });

  it('delegates getKpis to FinanceService', async () => {
    const query = { period: 'week' as const, category: 'Tuition fees' };
    await controller.getKpis(query);
    expect(service.getKpis).toHaveBeenCalledWith(query);
  });

  it('delegates getCharts to FinanceService', async () => {
    const query = { period: 'year' as const };
    await controller.getCharts(query);
    expect(service.getCharts).toHaveBeenCalledWith(query);
  });
});
