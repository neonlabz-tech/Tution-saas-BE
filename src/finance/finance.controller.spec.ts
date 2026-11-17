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
      createTransaction: vi.fn().mockResolvedValue({ id: 'TX-2026-001' }),
      updateTransaction: vi.fn().mockResolvedValue({ id: 'TX-2026-001' }),
      deleteTransaction: vi.fn().mockResolvedValue({ deleted: true }),
      getStudentPayments: vi.fn().mockResolvedValue({ items: [] }),
      recordStudentPayment: vi.fn().mockResolvedValue({ transaction: {} }),
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

  it('delegates createTransaction to FinanceService', async () => {
    const body = {
      type: TxType.EXPENSE,
      category: 'Rent',
      amount: 45000,
      description: 'Monthly rent',
    };
    await controller.createTransaction(body);
    expect(service.createTransaction).toHaveBeenCalledWith(body);
  });

  it('delegates updateTransaction to FinanceService', async () => {
    const body = { amount: 48000 };
    await controller.updateTransaction('TX-2026-001', body);
    expect(service.updateTransaction).toHaveBeenCalledWith('TX-2026-001', body);
  });

  it('delegates deleteTransaction to FinanceService', async () => {
    await controller.deleteTransaction('TX-2026-001');
    expect(service.deleteTransaction).toHaveBeenCalledWith('TX-2026-001');
  });

  it('delegates getStudentPayments to FinanceService', async () => {
    const query = {
      debtorsOnly: true,
      includeGraduated: false,
      page: 1,
      limit: 20,
    };
    await controller.getStudentPayments(query);
    expect(service.getStudentPayments).toHaveBeenCalledWith(query);
  });

  it('delegates recordStudentPayment to FinanceService', async () => {
    const body = {
      studentId: 'STU-2026-001',
      amount: 5000,
      category: 'Tuition fees' as const,
      method: 'Cash' as const,
    };
    await controller.recordStudentPayment(body);
    expect(service.recordStudentPayment).toHaveBeenCalledWith(body);
  });
});
