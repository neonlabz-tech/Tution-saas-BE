import { BadRequestException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TxType } from '../enums/status.enum.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from './finance.constants.js';
import { FinanceService } from './finance.service.js';
import { Transaction } from './schemas/transaction.schema.js';

function createChain<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('FinanceService', () => {
  let service: FinanceService;
  let transactionModel: Record<string, ReturnType<typeof vi.fn>>;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;

  const fixedNow = new Date('2026-11-13T10:00:00.000Z');

  beforeEach(async () => {
    transactionModel = {
      find: vi.fn(),
      countDocuments: vi.fn(),
    };
    studentModel = {
      find: vi.fn(),
    };
    moduleModel = {
      find: vi.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: getModelToken(Transaction.name), useValue: transactionModel },
        { provide: getModelToken(Student.name), useValue: studentModel },
        { provide: getModelToken(CourseModule.name), useValue: moduleModel },
      ],
    }).compile();

    service = moduleRef.get(FinanceService);
  });

  it('exports expected domain constants', () => {
    expect(INCOME_CATEGORIES).toEqual([
      'Tuition fees',
      'Registration fees',
      'Exam fees',
      'Other income',
    ]);
    expect(EXPENSE_CATEGORIES).toEqual([
      'Electricity bills',
      'Lecturer fees',
      'Internet bills',
      'Rent',
      'Equipment',
      'Maintenance',
      'Other expenses',
    ]);
    expect(PAYMENT_METHODS).toEqual([
      'Cash',
      'Bank Transfer',
      'Card (front desk)',
    ]);
  });

  describe('resolvePeriodRange', () => {
    it('resolves week as last 7 days inclusive', () => {
      const range = service.resolvePeriodRange({ period: 'week' }, fixedNow);
      expect(range).toEqual({
        period: 'week',
        from: '2026-11-07',
        to: '2026-11-13',
        span: 7,
      });
    });

    it('resolves month as last 30 days inclusive', () => {
      const range = service.resolvePeriodRange({ period: 'month' }, fixedNow);
      expect(range).toEqual({
        period: 'month',
        from: '2026-10-15',
        to: '2026-11-13',
        span: 30,
      });
    });

    it('resolves year as 1st of month 11 months ago to today', () => {
      const range = service.resolvePeriodRange({ period: 'year' }, fixedNow);
      expect(range).toEqual({
        period: 'year',
        from: '2025-12-01',
        to: '2026-11-13',
        span: 348,
      });
    });

    it('throws BadRequestException when from > to', () => {
      expect(() =>
        service.resolvePeriodRange(
          { period: 'custom', from: '2026-11-15', to: '2026-11-10' },
          fixedNow,
        ),
      ).toThrow(BadRequestException);
    });
  });

  describe('getTransactions', () => {
    it('returns paginated items, period KPIs, and global non-graduated totalOutstanding', async () => {
      const kpiTxs = [
        { type: TxType.INCOME, amount: 15000 },
        { type: TxType.INCOME, amount: 5000 },
        { type: TxType.EXPENSE, amount: 6000 },
      ];
      const pagedItems = [
        {
          id: 'TX-001',
          type: TxType.INCOME,
          category: 'Tuition fees',
          amount: 15000,
          date: '2026-11-12',
          description: 'Nov fee',
          studentId: 'STU-2026-001',
          method: 'Cash',
        },
      ];
      const tuitionPayments = [
        { studentId: 'STU-2026-001', amount: 3000 },
        { studentId: 'STU-2026-002', amount: 12000 },
      ];

      transactionModel.find
        .mockReturnValueOnce(createChain(kpiTxs))
        .mockReturnValueOnce(createChain(pagedItems))
        .mockReturnValueOnce(createChain(tuitionPayments));
      transactionModel.countDocuments.mockReturnValue({
        exec: vi.fn().mockResolvedValue(2),
      });

      studentModel.find.mockReturnValue(
        createChain([
          { id: 'STU-2026-001', moduleIds: ['mod_1', 'mod_2'] },
          { id: 'STU-2026-002', moduleIds: ['mod_1'] },
        ]),
      );
      moduleModel.find.mockReturnValue(
        createChain([
          { id: 'mod_1', fee: 5000 },
          { id: 'mod_2', fee: 7000 },
        ]),
      );

      const res = await service.getTransactions(
        {
          period: 'week',
          category: 'all',
          type: TxType.INCOME,
          page: 1,
          limit: 10,
        },
        fixedNow,
      );

      expect(transactionModel.find).toHaveBeenNthCalledWith(1, {
        date: { $gte: '2026-11-07', $lte: '2026-11-13' },
      });
      expect(transactionModel.find).toHaveBeenNthCalledWith(2, {
        date: { $gte: '2026-11-07', $lte: '2026-11-13' },
        type: TxType.INCOME,
      });
      expect(studentModel.find).toHaveBeenCalledWith({
        status: { $ne: 'graduated' },
      });

      expect(res.items).toEqual(pagedItems);
      expect(res.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(res.kpis).toEqual({
        totalIncome: 20000,
        totalExpense: 6000,
        netBalance: 14000,
        totalOutstanding: 9000, // STU-1: max(0, 12000 - 3000) + STU-2: max(0, 5000 - 12000)
        totalCount: 2,
      });
    });
  });

  describe('getCharts', () => {
    it('builds zero-filled daily buckets when span <= 62 and sorted category breakdowns', async () => {
      transactionModel.find.mockReturnValue(
        createChain([
          {
            type: TxType.INCOME,
            category: 'Tuition fees',
            amount: 10000,
            date: '2026-11-08',
          },
          {
            type: TxType.INCOME,
            category: 'Exam fees',
            amount: 2500,
            date: '2026-11-08',
          },
          {
            type: TxType.INCOME,
            category: 'Tuition fees',
            amount: 5000,
            date: '2026-11-10',
          },
          {
            type: TxType.EXPENSE,
            category: 'Rent',
            amount: 8000,
            date: '2026-11-08',
          },
          {
            type: TxType.EXPENSE,
            category: 'Internet bills',
            amount: 1500,
            date: '2026-11-11',
          },
        ]),
      );

      const res = await service.getCharts(
        { period: 'week', category: 'all' },
        fixedNow,
      );

      expect(res.granularity).toBe('daily');
      expect(res.series).toHaveLength(7);
      expect(res.series[0]).toMatchObject({
        key: '2026-11-07',
        income: 0,
        expense: 0,
        net: 0,
      });
      expect(res.series[1]).toMatchObject({
        key: '2026-11-08',
        income: 12500,
        expense: 8000,
        net: 4500,
      });
      expect(res.incomeByCategory).toEqual([
        { name: 'Tuition fees', value: 15000 },
        { name: 'Exam fees', value: 2500 },
      ]);
      expect(res.expenseByCategory).toEqual([
        { name: 'Rent', value: 8000 },
        { name: 'Internet bills', value: 1500 },
      ]);
    });

    it('builds zero-filled monthly buckets when span > 62', async () => {
      transactionModel.find.mockReturnValue(
        createChain([
          {
            type: TxType.INCOME,
            category: 'Tuition fees',
            amount: 20000,
            date: '2026-01-15',
          },
          {
            type: TxType.EXPENSE,
            category: 'Lecturer fees',
            amount: 9000,
            date: '2026-01-20',
          },
        ]),
      );

      const res = await service.getCharts({ period: 'year' }, fixedNow);

      expect(res.granularity).toBe('monthly');
      expect(res.series).toHaveLength(12);
      expect(res.series[0]).toMatchObject({
        key: '2025-12',
        income: 0,
        expense: 0,
        net: 0,
      });
      expect(res.series[1]).toMatchObject({
        key: '2026-01',
        income: 20000,
        expense: 9000,
        net: 11000,
      });
      expect(res.series[11].key).toBe('2026-11');
    });
  });
});
