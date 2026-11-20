import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../enums/role.enum.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getStudentPayments: vi.fn(),
      listPayments: vi.fn(),
      getPaymentById: vi.fn(),
      createPayment: vi.fn(),
      updatePayment: vi.fn(),
      deletePayment: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: service }],
    }).compile();

    controller = module.get<PaymentsController>(PaymentsController);
  });

  it('delegates getStudentPayments to service', async () => {
    const query = { page: 1, limit: 20, debtorsOnly: false, includeGraduated: false };
    service.getStudentPayments.mockResolvedValue({ items: [] });

    await controller.getStudentPayments(query);
    expect(service.getStudentPayments).toHaveBeenCalledWith(query);
  });

  it('delegates listPayments to service', async () => {
    const query = { page: 1, limit: 20 };
    service.listPayments.mockResolvedValue({ items: [] });

    await controller.listPayments(query);
    expect(service.listPayments).toHaveBeenCalledWith(query);
  });

  it('delegates getPaymentById to service', async () => {
    service.getPaymentById.mockResolvedValue({ payment: { id: 'PAY-2026-001' } });

    await controller.getPaymentById('PAY-2026-001');
    expect(service.getPaymentById).toHaveBeenCalledWith('PAY-2026-001');
  });

  it('delegates createPayment with logged-in user fullName', async () => {
    const dto = {
      studentId: 'STU-2026-001',
      amount: 25000,
      discount: 0,
      method: 'Cash' as const,
      category: 'Tuition fees' as const,
      date: '2026-11-20',
    };
    const user = {
      sub: 'USR-001',
      email: 'admin@eduflow.lk',
      fullName: 'Super Admin',
      role: Role.ADMIN,
    };
    service.createPayment.mockResolvedValue({ payment: { id: 'PAY-2026-001' } });

    await controller.createPayment(dto, user);
    expect(service.createPayment).toHaveBeenCalledWith(dto, 'Super Admin');
  });

  it('delegates updatePayment and deletePayment to service', async () => {
    service.updatePayment.mockResolvedValue({ payment: { id: 'PAY-2026-001' } });
    service.deletePayment.mockResolvedValue({ deleted: true, id: 'PAY-2026-001' });

    await controller.updatePayment('PAY-2026-001', { status: 'void' });
    expect(service.updatePayment).toHaveBeenCalledWith('PAY-2026-001', {
      status: 'void',
    });

    await controller.deletePayment('PAY-2026-001');
    expect(service.deletePayment).toHaveBeenCalledWith('PAY-2026-001');
  });
});
