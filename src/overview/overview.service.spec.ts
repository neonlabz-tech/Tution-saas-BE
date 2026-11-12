import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { AttendanceRecord } from '../attendance/schemas/attendance.schema.js';
import {
  AttendanceStatus,
  ClassStatus,
  ModuleStatus,
  NoticePriority,
  NoticeStatus,
  TeacherStatus,
  TxType,
} from '../enums/status.enum.js';
import { Transaction } from '../finance/schemas/transaction.schema.js';
import { CourseModule } from '../modules/schemas/module.schema.js';
import { Notice } from '../notices/schemas/notice.schema.js';
import { OnlineClass } from '../online-classes/schemas/online-class.schema.js';
import { Student } from '../students/schemas/student.schema.js';
import { Teacher } from '../teachers/schemas/teacher.schema.js';
import { OverviewService } from './overview.service.js';

function mockFind<T>(result: T) {
  return {
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('OverviewService', () => {
  let service: OverviewService;
  let studentModel: Record<string, ReturnType<typeof vi.fn>>;
  let teacherModel: Record<string, ReturnType<typeof vi.fn>>;
  let moduleModel: Record<string, ReturnType<typeof vi.fn>>;
  let attendanceModel: Record<string, ReturnType<typeof vi.fn>>;
  let transactionModel: Record<string, ReturnType<typeof vi.fn>>;
  let onlineClassModel: Record<string, ReturnType<typeof vi.fn>>;
  let noticeModel: Record<string, ReturnType<typeof vi.fn>>;

  const today = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  beforeEach(async () => {
    studentModel = { find: vi.fn() };
    teacherModel = { find: vi.fn() };
    moduleModel = { find: vi.fn() };
    attendanceModel = { find: vi.fn() };
    transactionModel = { find: vi.fn() };
    onlineClassModel = { find: vi.fn() };
    noticeModel = { find: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverviewService,
        { provide: getModelToken(Student.name), useValue: studentModel },
        { provide: getModelToken(Teacher.name), useValue: teacherModel },
        { provide: getModelToken(CourseModule.name), useValue: moduleModel },
        {
          provide: getModelToken(AttendanceRecord.name),
          useValue: attendanceModel,
        },
        { provide: getModelToken(Transaction.name), useValue: transactionModel },
        { provide: getModelToken(OnlineClass.name), useValue: onlineClassModel },
        { provide: getModelToken(Notice.name), useValue: noticeModel },
      ],
    }).compile();

    service = module.get<OverviewService>(OverviewService);
  });

  it('returns safe zeroed KPIs and trends when collections are empty', async () => {
    studentModel.find.mockReturnValue(mockFind([]));
    teacherModel.find.mockReturnValue(mockFind([]));
    moduleModel.find.mockReturnValue(mockFind([]));
    attendanceModel.find.mockReturnValue(mockFind([]));
    transactionModel.find.mockReturnValue(mockFind([]));
    onlineClassModel.find.mockReturnValue(mockFind([]));

    const res = await service.getKpisAndTrends();

    expect(res.kpis.totalStudents.value).toBe(0);
    expect(res.kpis.activeStudents.percentOfEnrollment).toBe(0);
    expect(res.kpis.todayAttendance.rate).toBe(0);
    expect(res.trends.incomeVsExpenses).toHaveLength(6);
    expect(res.trends.studentEnrollment).toHaveLength(12);
  });

  it('computes KPIs, trends, and activity feeds accurately from domain collections', async () => {
    const monthPrefix = today.slice(0, 7);
    const futureDate = '2099-12-31';

    studentModel.find.mockReturnValue(
      mockFind([
        {
          id: 'STU-2026-001',
          fullName: 'Nimal Perera',
          batch: '2025-A Morning',
          moduleIds: ['mod_mth'],
          enrollmentDate: today,
          status: 'active',
        },
      ]),
    );
    teacherModel.find.mockReturnValue(
      mockFind([
        {
          id: 'TCH-001',
          fullName: 'Kajaluxmy Kanesarasa',
          status: TeacherStatus.ACTIVE,
        },
      ]),
    );
    moduleModel.find.mockReturnValue(
      mockFind([
        {
          id: 'mod_mth',
          fee: 72000,
          status: ModuleStatus.ACTIVE,
        },
      ]),
    );
    attendanceModel.find.mockReturnValue(
      mockFind([
        {
          id: 'att_1',
          studentId: 'STU-2026-001',
          moduleId: 'mod_mth',
          date: today,
          status: AttendanceStatus.PRESENT,
        },
      ]),
    );
    transactionModel.find.mockReturnValue(
      mockFind([
        {
          id: 'tx_1',
          type: TxType.INCOME,
          category: 'Tuition fees',
          amount: 50000,
          date: `${monthPrefix}-01`,
          studentId: 'STU-2026-001',
          method: 'Cash',
          description: 'Partial tuition',
        },
        {
          id: 'tx_2',
          type: TxType.EXPENSE,
          category: 'Rent',
          amount: 15000,
          date: `${monthPrefix}-02`,
          description: 'Hall rent',
        },
      ]),
    );
    onlineClassModel.find.mockReturnValue(
      mockFind([
        {
          id: 'cls_1',
          title: 'Calculus Live',
          moduleId: 'mod_mth',
          teacherId: 'TCH-001',
          batch: '2025-A Morning',
          start: `${futureDate}T10:00`,
          end: `${futureDate}T11:30`,
          link: 'https://meet.example.com/1',
          status: ClassStatus.SCHEDULED,
        },
      ]),
    );
    noticeModel.find.mockReturnValue(
      mockFind([
        {
          _id: '6af437bb9b047f085077e95a',
          title: 'Class Cancelled',
          description: 'Notice details',
          batches: [],
          publishDate: today,
          expiryDate: futureDate,
          priority: NoticePriority.HIGH,
          status: NoticeStatus.PUBLISHED,
        },
      ]),
    );

    const res = await service.getOverview();

    expect(res.kpis.totalStudents.value).toBe(1);
    expect(res.kpis.activeStudents.percentOfEnrollment).toBe(100);
    expect(res.kpis.totalTeachers).toEqual({ value: 1, activeTeachers: 1 });
    expect(res.kpis.todayAttendance.rate).toBe(100);
    expect(res.kpis.monthlyIncome.value).toBe(50000);
    expect(res.kpis.monthlyExpenses.value).toBe(15000);
    expect(res.kpis.outstandingPayments).toEqual({
      value: 22000,
      studentsWithBalances: 1,
    });

    expect(res.activityFeeds.upcomingClasses[0].teacherName).toBe(
      'Kajaluxmy Kanesarasa',
    );
    expect(res.activityFeeds.recentRegistrations).toHaveLength(1);
    expect(res.activityFeeds.recentPayments[0].studentName).toBe('Nimal Perera');
    expect(res.activityFeeds.activeNotices[0].id).toBe(
      '6af437bb9b047f085077e95a',
    );
    expect(res.activityFeeds.timeline.length).toBeGreaterThanOrEqual(4);
  });
});
