import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TxType } from '../enums/status.enum.js';
import { Transaction } from '../finance/schemas/transaction.schema.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { Counter } from '../students/schemas/counter.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import { PaymentsService } from './payments.service.js';
import { Payment } from './schemas/payment.schema.js';

function createQueryMock<T>(value: T) {
  const query = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
  return query;
}

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentModel: Record<string, ReturnType<typeof vi.fn>>;
  let transactionModel: Record<string, ReturnType<typeof vi.fn>>;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;
  let counterModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    paymentModel = {
      find: vi.fn(),
      findOne: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
    };

    transactionModel = {
      find: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
      deleteOne: vi.fn(),
    };

    studentModel = {
      find: vi.fn(),
      findOne: vi.fn(),
    };

    moduleModel = {
      find: vi.fn(),
    };

    counterModel = {
      findOneAndUpdate: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(Payment.name), useValue: paymentModel },
        { provide: getModelToken(Transaction.name), useValue: transactionModel },
        { provide: getModelToken(Student.name), useValue: studentModel },
        { provide: getModelToken(CourseModule.name), useValue: moduleModel },
        { provide: getModelToken(Counter.name), useValue: counterModel },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  describe('createPayment', () => {
    it('creates payment with PAY/RCP numbers and syncs a transaction', async () => {
      studentModel.findOne.mockReturnValue(
        createQueryMock({
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          moduleIds: ['mod_mth_101'],
        }),
      );
      moduleModel.find.mockReturnValue(createQueryMock([{ fee: 75000 }]));
      transactionModel.find
        .mockReturnValueOnce(createQueryMock([{ amount: 25000 }]))
        .mockReturnValueOnce(createQueryMock([{ amount: 25000 }, { amount: 20000 }]));

      counterModel.findOneAndUpdate
        .mockReturnValueOnce(createQueryMock({ seq: 3 }))
        .mockReturnValueOnce(createQueryMock({ seq: 7 }))
        .mockReturnValueOnce(createQueryMock({ seq: 12 }));

      transactionModel.create.mockResolvedValue({
        id: 'TX-2026-012',
        type: TxType.INCOME,
        category: 'Tuition fees',
        amount: 20000,
        date: '2026-11-20',
        description: 'November installment',
        studentId: 'STU-2026-001',
        method: 'Cash',
      });

      paymentModel.create.mockResolvedValue({
        id: 'PAY-2026-003',
        receiptNo: 'RCP-2026-007',
        studentId: 'STU-2026-001',
        amount: 20000,
        discount: 0,
        category: 'Tuition fees',
        method: 'Cash',
        date: '2026-11-20',
        description: 'November installment',
        status: 'completed',
        collectedBy: 'Admin',
        transactionId: 'TX-2026-012',
      });

      const res = await service.createPayment(
        {
          studentId: 'STU-2026-001',
          amount: 20000,
          discount: 0,
          method: 'Cash',
          category: 'Tuition fees',
          date: '2026-11-20',
          description: 'November installment',
        },
        'Admin',
        new Date('2026-11-20T00:00:00Z'),
      );

      expect(res.payment.id).toBe('PAY-2026-003');
      expect(res.payment.receiptNo).toBe('RCP-2026-007');
      expect(res.payment.transactionId).toBe('TX-2026-012');
      expect(res.payment.collectedBy).toBe('Admin');
      expect(res.transaction.id).toBe('TX-2026-012');
      expect(res.studentSummary).toEqual({
        id: 'STU-2026-001',
        fullName: 'Nimal Perera',
        feeTotal: 75000,
        paidTotal: 45000,
        outstanding: 30000,
        paymentStatus: 'partial',
      });
    });

    it('rejects overpayment exceeding student outstanding balance', async () => {
      studentModel.findOne.mockReturnValue(
        createQueryMock({
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          moduleIds: ['mod_mth_101'],
        }),
      );
      moduleModel.find.mockReturnValue(createQueryMock([{ fee: 50000 }]));
      transactionModel.find.mockReturnValue(createQueryMock([{ amount: 40000 }]));

      await expect(
        service.createPayment({
          studentId: 'STU-2026-001',
          amount: 15000,
          discount: 0,
          method: 'Cash',
          category: 'Tuition fees',
          date: '2026-11-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects payment when student has zero outstanding balance', async () => {
      studentModel.findOne.mockReturnValue(
        createQueryMock({
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          moduleIds: ['mod_mth_101'],
        }),
      );
      moduleModel.find.mockReturnValue(createQueryMock([{ fee: 50000 }]));
      transactionModel.find.mockReturnValue(createQueryMock([{ amount: 50000 }]));

      await expect(
        service.createPayment({
          studentId: 'STU-2026-001',
          amount: 5000,
          discount: 0,
          method: 'Cash',
          category: 'Tuition fees',
          date: '2026-11-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updatePayment', () => {
    it('deletes linked transaction when status changes to void', async () => {
      paymentModel.findOne.mockReturnValue(
        createQueryMock({
          _id: 'obj1',
          id: 'PAY-2026-001',
          receiptNo: 'RCP-2026-001',
          studentId: 'STU-2026-001',
          amount: 20000,
          discount: 0,
          category: 'Tuition fees',
          method: 'Cash',
          date: '2026-11-20',
          description: 'Installment',
          status: 'completed',
          transactionId: 'TX-2026-001',
        }),
      );
      transactionModel.deleteOne.mockReturnValue(createQueryMock({ deletedCount: 1 }));
      paymentModel.findOneAndUpdate.mockReturnValue(
        createQueryMock({
          id: 'PAY-2026-001',
          receiptNo: 'RCP-2026-001',
          studentId: 'STU-2026-001',
          amount: 20000,
          discount: 0,
          category: 'Tuition fees',
          method: 'Cash',
          date: '2026-11-20',
          description: 'Installment',
          status: 'void',
        }),
      );
      studentModel.findOne.mockReturnValue(
        createQueryMock({
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          moduleIds: ['mod_mth_101'],
        }),
      );
      moduleModel.find.mockReturnValue(createQueryMock([{ fee: 50000 }]));
      transactionModel.find.mockReturnValue(createQueryMock([]));

      const res = await service.updatePayment('PAY-2026-001', { status: 'void' });

      expect(transactionModel.deleteOne).toHaveBeenCalledWith({ id: 'TX-2026-001' });
      expect(res.payment.status).toBe('void');
      expect(res.studentSummary?.outstanding).toBe(50000);
    });

    it('re-creates linked transaction when voided payment is restored to completed', async () => {
      paymentModel.findOne.mockReturnValue(
        createQueryMock({
          _id: 'obj1',
          id: 'PAY-2026-001',
          receiptNo: 'RCP-2026-001',
          studentId: 'STU-2026-001',
          amount: 20000,
          discount: 0,
          category: 'Tuition fees',
          method: 'Cash',
          date: '2026-11-20',
          description: 'Installment',
          status: 'void',
        }),
      );
      counterModel.findOneAndUpdate.mockReturnValue(createQueryMock({ seq: 99 }));
      transactionModel.create.mockResolvedValue({ id: 'TX-2026-099' });
      paymentModel.findOneAndUpdate.mockReturnValue(
        createQueryMock({
          id: 'PAY-2026-001',
          receiptNo: 'RCP-2026-001',
          studentId: 'STU-2026-001',
          amount: 20000,
          discount: 0,
          category: 'Tuition fees',
          method: 'Cash',
          date: '2026-11-20',
          description: 'Installment',
          status: 'completed',
          transactionId: 'TX-2026-099',
        }),
      );
      studentModel.findOne.mockReturnValue(
        createQueryMock({
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          moduleIds: ['mod_mth_101'],
        }),
      );
      moduleModel.find.mockReturnValue(createQueryMock([{ fee: 50000 }]));
      transactionModel.find.mockReturnValue(createQueryMock([{ amount: 20000 }]));

      const res = await service.updatePayment(
        'PAY-2026-001',
        { status: 'completed' },
        new Date('2026-11-20T00:00:00Z'),
      );

      expect(transactionModel.create).toHaveBeenCalled();
      expect(res.payment.transactionId).toBe('TX-2026-099');
      expect(res.studentSummary?.outstanding).toBe(30000);
    });
  });

  describe('deletePayment', () => {
    it('deletes both payment and linked transaction', async () => {
      paymentModel.findOne.mockReturnValue(
        createQueryMock({
          _id: 'obj1',
          id: 'PAY-2026-001',
          studentId: 'STU-2026-001',
          transactionId: 'TX-2026-001',
        }),
      );
      paymentModel.deleteOne.mockReturnValue(createQueryMock({ deletedCount: 1 }));
      transactionModel.deleteOne.mockReturnValue(createQueryMock({ deletedCount: 1 }));
      studentModel.findOne.mockReturnValue(
        createQueryMock({
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          moduleIds: ['mod_mth_101'],
        }),
      );
      moduleModel.find.mockReturnValue(createQueryMock([{ fee: 50000 }]));
      transactionModel.find.mockReturnValue(createQueryMock([]));

      const res = await service.deletePayment('PAY-2026-001');

      expect(paymentModel.deleteOne).toHaveBeenCalledWith({ _id: 'obj1' });
      expect(transactionModel.deleteOne).toHaveBeenCalledWith({ id: 'TX-2026-001' });
      expect(res).toEqual({
        deleted: true,
        id: 'PAY-2026-001',
        deletedTransactionId: 'TX-2026-001',
        studentSummary: {
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          feeTotal: 50000,
          paidTotal: 0,
          outstanding: 50000,
          paymentStatus: 'unpaid',
        },
      });
    });

    it('throws NotFoundException when payment does not exist', async () => {
      paymentModel.findOne.mockReturnValue(createQueryMock(null));
      await expect(service.deletePayment('PAY-9999-999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStudentPayments', () => {
    it('filters by paymentStatus and computes summary counts', async () => {
      studentModel.find.mockReturnValue(
        createQueryMock([
          {
            id: 'STU-1',
            fullName: 'Paid Student',
            email: 'paid@test.com',
            batch: '2026',
            status: 'active',
            moduleIds: ['M1'],
          },
          {
            id: 'STU-2',
            fullName: 'Partial Student',
            email: 'partial@test.com',
            batch: '2026',
            status: 'active',
            moduleIds: ['M1'],
          },
          {
            id: 'STU-3',
            fullName: 'Unpaid Student',
            email: 'unpaid@test.com',
            batch: '2026',
            status: 'active',
            moduleIds: ['M1'],
          },
        ]),
      );
      moduleModel.find.mockReturnValue(
        createQueryMock([{ id: 'M1', fee: 50000 }]),
      );
      transactionModel.find.mockReturnValue(
        createQueryMock([
          {
            studentId: 'STU-1',
            category: 'Tuition fees',
            amount: 50000,
            date: '2026-11-10',
          },
          {
            studentId: 'STU-2',
            category: 'Tuition fees',
            amount: 20000,
            date: '2026-11-12',
          },
        ]),
      );

      const res = await service.getStudentPayments({
        paymentStatus: 'partial',
        debtorsOnly: false,
        includeGraduated: false,
        page: 1,
        limit: 20,
      });

      expect(res.items).toHaveLength(1);
      expect(res.items[0].id).toBe('STU-2');
      expect(res.summary).toEqual({
        totalStudents: 3,
        debtorCount: 2,
        settledCount: 1,
        totalOutstanding: 80000,
        totalCollected: 70000,
      });
    });
  });

  describe('listPayments', () => {
    it('returns paginated payments enriched with student details', async () => {
      paymentModel.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(1),
      });
      paymentModel.find
        .mockReturnValueOnce(
          createQueryMock([
            {
              id: 'PAY-2026-001',
              receiptNo: 'RCP-2026-001',
              studentId: 'STU-2026-001',
              amount: 25000,
              discount: 0,
              category: 'Tuition fees',
              method: 'Cash',
              date: '2026-11-20',
              description: 'Installment',
              status: 'completed',
              transactionId: 'TX-2026-001',
            },
          ]),
        )
        .mockReturnValueOnce(
          createQueryMock([{ amount: 25000, status: 'completed' }]),
        );
      studentModel.find.mockReturnValue(
        createQueryMock([
          {
            id: 'STU-2026-001',
            fullName: 'Nimal Perera',
            batch: '2026 A/L',
            email: 'nimal@gmail.com',
          },
        ]),
      );

      const res = await service.listPayments({ page: 1, limit: 20 });

      expect(res.items).toHaveLength(1);
      expect(res.items[0].student).toEqual({
        id: 'STU-2026-001',
        fullName: 'Nimal Perera',
        batch: '2026 A/L',
        email: 'nimal@gmail.com',
      });
      expect(res.summary).toEqual({
        totalCollected: 25000,
        totalCount: 1,
      });
    });
  });
});
