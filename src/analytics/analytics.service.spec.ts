import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceRecord } from '../attendance/schemas/attendance.schema.js';
import { AttendanceStatus, ModuleStatus, TxType } from '../enums/status.enum.js';
import { FinanceService } from '../finance/finance.service.js';
import { Transaction } from '../finance/schemas/transaction.schema.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import { Teacher } from '../teachers/schemas/teacher.schema.js';
import { AnalyticsService } from './analytics.service.js';

function createChain<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;
  let attendanceModel: Record<string, ReturnType<typeof vi.fn>>;
  let transactionModel: Record<string, ReturnType<typeof vi.fn>>;
  let teacherModel: Record<string, ReturnType<typeof vi.fn>>;

  const fixedNow = new Date('2026-11-18T10:00:00.000Z');

  beforeEach(async () => {
    studentModel = { find: vi.fn() };
    moduleModel = { find: vi.fn() };
    attendanceModel = { find: vi.fn() };
    transactionModel = { find: vi.fn() };
    teacherModel = { find: vi.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: FinanceService,
          useValue: {
            resolvePeriodRange: vi.fn().mockReturnValue({
              period: 'week',
              from: '2026-11-12',
              to: '2026-11-18',
              span: 7,
            }),
          },
        },
        { provide: getModelToken(Student.name), useValue: studentModel },
        { provide: getModelToken(CourseModule.name), useValue: moduleModel },
        {
          provide: getModelToken(AttendanceRecord.name),
          useValue: attendanceModel,
        },
        { provide: getModelToken(Transaction.name), useValue: transactionModel },
        { provide: getModelToken(Teacher.name), useValue: teacherModel },
      ],
    }).compile();

    service = moduleRef.get(AnalyticsService);
  });

  describe('getOverview', () => {
    it('computes 6 KPIs, 3 zero-filled series, and expense & payment-status donuts', async () => {
      studentModel.find.mockReturnValue(
        createChain([
          {
            id: 'STU-2026-001',
            status: 'active',
            moduleIds: ['mod_mth'],
            enrollmentDate: '2026-11-13',
          },
          {
            id: 'STU-2026-002',
            status: 'active',
            moduleIds: ['mod_mth'],
            enrollmentDate: '2026-11-01',
          },
          {
            id: 'STU-2026-003',
            status: 'pending',
            moduleIds: ['mod_mth'],
            enrollmentDate: '2026-11-15',
          },
        ]),
      );
      moduleModel.find.mockReturnValue(
        createChain([{ id: 'mod_mth', fee: 10000 }]),
      );
      transactionModel.find
        .mockReturnValueOnce(
          createChain([
            {
              type: TxType.INCOME,
              category: 'Tuition fees',
              amount: 15000,
              date: '2026-11-13',
            },
            {
              type: TxType.EXPENSE,
              category: 'Rent',
              amount: 6000,
              date: '2026-11-14',
            },
            {
              type: TxType.EXPENSE,
              category: 'Internet bills',
              amount: 2000,
              date: '2026-11-14',
            },
          ]),
        )
        .mockReturnValueOnce(
          createChain([
            { studentId: 'STU-2026-001', amount: 10000 }, // paid
            { studentId: 'STU-2026-002', amount: 4000 }, // partial (owed 6000)
          ]),
        );
      attendanceModel.find.mockReturnValue(
        createChain([
          { date: '2026-11-13', status: AttendanceStatus.PRESENT },
          { date: '2026-11-13', status: AttendanceStatus.LATE },
          { date: '2026-11-14', status: AttendanceStatus.ABSENT },
          { date: '2026-11-14', status: AttendanceStatus.EXCUSED },
        ]),
      );

      const res = await service.getOverview({ period: 'week' }, fixedNow);

      expect(res.granularity).toBe('daily');
      expect(res.kpis).toEqual({
        totalIncome: 15000,
        totalExpense: 8000,
        netBalance: 7000,
        totalOutstanding: 16000, // 0 + 6000 + 10000
        activeStudents: 2,
        newEnrollments: 2,
        attendanceRate: 66.7, // (1 + 1) / 3 * 100
      });
      expect(res.financeSeries).toHaveLength(7);
      expect(res.enrollmentSeries).toHaveLength(7);
      expect(res.attendanceSeries).toHaveLength(7);
      expect(res.expenseByCategory).toEqual([
        { name: 'Rent', value: 6000 },
        { name: 'Internet bills', value: 2000 },
      ]);
      expect(res.paymentStatusBreakdown).toEqual([
        { name: 'paid', value: 1 },
        { name: 'partial', value: 1 },
        { name: 'unpaid', value: 1 },
      ]);
    });
  });

  describe('getModulePerformance', () => {
    it('computes enrolledCount, pro-rata collected & owed, and module attendanceRate', async () => {
      moduleModel.find
        .mockReturnValueOnce(
          createChain([
            {
              id: 'mod_mth',
              code: 'MTH-101',
              name: 'Pure Mathematics',
              fee: 6000,
              status: ModuleStatus.ACTIVE,
              teacherId: 'TCH-001',
            },
            {
              id: 'mod_phy',
              code: 'PHY-102',
              name: 'Physics',
              fee: 4000,
              status: ModuleStatus.ACTIVE,
              teacherId: null,
            },
          ]),
        )
        .mockReturnValueOnce(
          createChain([
            { id: 'mod_mth', fee: 6000 },
            { id: 'mod_phy', fee: 4000 },
          ]),
        );

      teacherModel.find.mockReturnValue(
        createChain([{ id: 'TCH-001', fullName: 'Kajaluxmy Kanesarasa' }]),
      );
      studentModel.find.mockReturnValue(
        createChain([
          { id: 'STU-2026-001', moduleIds: ['mod_mth', 'mod_phy'] }, // total fee 10,000
        ]),
      );
      transactionModel.find.mockReturnValue(
        createChain([
          { studentId: 'STU-2026-001', amount: 5000 }, // 50% paid -> 3000 mth, 2000 phy
        ]),
      );
      attendanceModel.find.mockReturnValue(
        createChain([
          { moduleId: 'mod_mth', status: AttendanceStatus.PRESENT },
          { moduleId: 'mod_mth', status: AttendanceStatus.ABSENT },
          { moduleId: 'mod_phy', status: AttendanceStatus.LATE },
        ]),
      );

      const res = await service.getModulePerformance({}, fixedNow);

      expect(res.items[0]).toMatchObject({
        id: 'mod_mth',
        teacherId: 'TCH-001',
        teacher: { id: 'TCH-001', fullName: 'Kajaluxmy Kanesarasa' },
        enrolledCount: 1,
        expectedRevenue: 6000,
        collected: 3000,
        owed: 3000,
        collectionRate: 50,
        attendanceRate: 50,
      });
      expect(res.items[1]).toMatchObject({
        id: 'mod_phy',
        teacherId: null,
        teacher: null,
        enrolledCount: 1,
        expectedRevenue: 4000,
        collected: 2000,
        owed: 2000,
        collectionRate: 50,
        attendanceRate: 100,
      });
      expect(res.summary).toEqual({
        totalModules: 2,
        totalEnrolled: 2,
        totalExpectedRevenue: 10000,
        totalCollected: 5000,
        totalOwed: 5000,
        averageAttendanceRate: 75,
      });
    });
  });
});
