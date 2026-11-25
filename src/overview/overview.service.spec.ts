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
import { ACTIVE_NOTICES_LIMIT, OverviewService } from './overview.service.js';

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

  it('active notices: top N (ACTIVE_NOTICES_LIMIT) by priority, total of all live ones, skips scheduled/draft/expired', async () => {
    const shift = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const live = (id: string, priority: NoticePriority) => ({
      id, title: id, description: '', batches: [], publishDate: today,
      expiryDate: shift(5), priority, status: NoticeStatus.PUBLISHED,
    });

    for (const m of [studentModel, teacherModel, moduleModel, attendanceModel, transactionModel, onlineClassModel]) {
      m.find.mockReturnValue(mockFind([]));
    }
    noticeModel.find.mockReturnValue(
      mockFind([
        live('H1', NoticePriority.HIGH),
        live('H2', NoticePriority.HIGH),
        live('H3', NoticePriority.HIGH),
        live('H4', NoticePriority.HIGH),
        live('M1', NoticePriority.MEDIUM),
        live('L1', NoticePriority.LOW),
        { ...live('SCHED', NoticePriority.HIGH), publishDate: shift(3) },
        { ...live('DRAFT', NoticePriority.HIGH), status: NoticeStatus.DRAFT },
        { ...live('OLD', NoticePriority.HIGH), publishDate: shift(-10), expiryDate: shift(-1) },
      ]),
    );

    const { activityFeeds } = await service.getOverview();

    expect(activityFeeds.activeNotices.map((n) => n.id)).toEqual(
      ['H1', 'H2', 'H3', 'H4', 'M1', 'L1'].slice(0, ACTIVE_NOTICES_LIMIT),
    );
    expect(activityFeeds.activeNoticesTotal).toBe(6);
  });

  it('supports upcoming physical classes with hall info alongside online classes', async () => {
    const futureDate = '2099-12-31';
    for (const m of [studentModel, teacherModel, moduleModel, attendanceModel, transactionModel, noticeModel]) {
      m.find.mockReturnValue(mockFind([]));
    }
    onlineClassModel.find.mockReturnValue(
      mockFind([
        {
          id: 'cls_physical',
          title: 'Chemistry Lab in Hall 2',
          moduleId: 'mod_chem',
          teacherId: 'TCH-002',
          batch: '2025-A Morning',
          classType: 'physical',
          hall: 'Hall 2B',
          start: `${futureDate}T09:00`,
          end: `${futureDate}T11:00`,
          status: ClassStatus.SCHEDULED,
        },
        {
          id: 'cls_online',
          title: 'Physics Zoom',
          moduleId: 'mod_phy',
          teacherId: 'TCH-003',
          batch: '2025-A Morning',
          classType: 'online',
          link: 'https://zoom.us/j/12345',
          start: `${futureDate}T13:00`,
          end: `${futureDate}T15:00`,
          status: ClassStatus.SCHEDULED,
        },
      ]),
    );

    const { activityFeeds } = await service.getOverview();
    expect(activityFeeds.upcomingClasses).toHaveLength(2);
    expect(activityFeeds.upcomingClasses[0].classType).toBe('physical');
    expect(activityFeeds.upcomingClasses[0].hall).toBe('Hall 2B');
    expect(activityFeeds.upcomingClasses[0].link).toBe('');
    expect(activityFeeds.upcomingClasses[1].classType).toBe('online');
    expect(activityFeeds.upcomingClasses[1].link).toBe('https://zoom.us/j/12345');
  });
});
