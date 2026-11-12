import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  AttendanceRecord,
  type AttendanceRecordDocument,
} from '../attendance/schemas/attendance.schema.js';
import {
  AttendanceStatus,
  ClassStatus,
  ModuleStatus,
  NoticePriority,
  NoticeStatus,
  TeacherStatus,
  TxType,
} from '../enums/status.enum.js';
import {
  Transaction,
  type TransactionDocument,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  Notice,
  type NoticeDocument,
} from '../notices/schemas/notice.schema.js';
import {
  OnlineClass,
  type OnlineClassDocument,
} from '../online-classes/schemas/online-class.schema.js';
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import {
  Teacher,
  type TeacherDocument,
} from '../teachers/schemas/teacher.schema.js';

export interface OverviewSummary {
  classesToday: number;
  attendanceMarkedToday: number;
  studentsWithPendingFees: number;
}

export interface OverviewKpis {
  totalStudents: {
    value: number;
    delta: number;
    spark: number[];
  };
  activeStudents: {
    value: number;
    percentOfEnrollment: number;
    spark: number[];
  };
  totalTeachers: {
    value: number;
    activeTeachers: number;
  };
  activeModules: {
    value: number;
    totalModules: number;
  };
  todayAttendance: {
    rate: number;
    markedCount: number;
    spark: number[];
  };
  monthlyIncome: {
    value: number;
    delta: number;
    spark: number[];
  };
  monthlyExpenses: {
    value: number;
    delta: number;
    spark: number[];
  };
  outstandingPayments: {
    value: number;
    studentsWithBalances: number;
  };
}

export interface IncomeExpensePoint {
  key: string;
  label: string;
  income: number;
  expense: number;
}

export interface EnrollmentPoint {
  key: string;
  label: string;
  total: number;
  added: number;
}

export interface AttendanceTrendPoint {
  date: string;
  label: string;
  rate: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface OverviewTrends {
  incomeVsExpenses: IncomeExpensePoint[];
  studentEnrollment: EnrollmentPoint[];
  attendancePercentage: {
    avgRate: number;
    days: AttendanceTrendPoint[];
  };
}

export interface UpcomingClassItem {
  id: string;
  title: string;
  moduleId: string;
  teacherId: string;
  teacherName: string;
  batch: string;
  start: string;
  end: string;
  link: string;
  status: ClassStatus;
}

export interface RecentRegistrationItem {
  id: string;
  fullName: string;
  batch: string;
  enrollmentDate: string;
  status: string;
}

export interface RecentPaymentItem {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  date: string;
  method: string;
  description: string;
}

export interface ActiveNoticeItem {
  id: string;
  title: string;
  description: string;
  batches: string[];
  publishDate: string;
  expiryDate: string;
  priority: NoticePriority;
  status: NoticeStatus;
}

export interface ActivityTimelineItem {
  id: string;
  type: 'registration' | 'payment' | 'notice' | 'class';
  title: string;
  subtitle: string;
  timestamp: string;
}

export interface OverviewActivityFeeds {
  upcomingClasses: UpcomingClassItem[];
  recentRegistrations: RecentRegistrationItem[];
  recentPayments: RecentPaymentItem[];
  activeNotices: ActiveNoticeItem[];
  timeline: ActivityTimelineItem[];
}

export interface OverviewResponse {
  summary: OverviewSummary;
  kpis: OverviewKpis;
  trends: OverviewTrends;
  activityFeeds: OverviewActivityFeeds;
}

type LeanNotice = Notice & { _id?: unknown };

const pad = (n: number) => String(n).padStart(2, '0');

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, delta: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + delta);
  return next;
}

function buildMonths(count: number, now: Date) {
  return Array.from({ length: count }, (_, i) => {
    const offset = i - (count - 1);
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
      label: d.toLocaleDateString('en-US', { month: 'short' }),
      end: toISODate(end),
    };
  });
}

function pctDelta(current: number, previous: number): number {
  return previous ? Math.round(((current - previous) / previous) * 100) : 0;
}

function computeAttendanceRate(records: Pick<AttendanceRecord, 'status'>[]) {
  const counted = records.filter((r) => r.status !== AttendanceStatus.EXCUSED);
  if (counted.length === 0) return 0;
  const attended = counted.filter(
    (r) =>
      r.status === AttendanceStatus.PRESENT ||
      r.status === AttendanceStatus.LATE,
  ).length;
  return Math.round((attended / counted.length) * 1000) / 10;
}

@Injectable()
export class OverviewService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(Teacher.name)
    private readonly teacherModel: Model<TeacherDocument>,
    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,
    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(OnlineClass.name)
    private readonly onlineClassModel: Model<OnlineClassDocument>,
    @InjectModel(Notice.name)
    private readonly noticeModel: Model<NoticeDocument>,
  ) {}

  async getOverview(): Promise<OverviewResponse> {
    const now = new Date();
    const [
      students,
      teachers,
      modules,
      attendance,
      transactions,
      classes,
      notices,
    ] = await Promise.all([
      this.studentModel.find().lean<Student[]>().exec(),
      this.teacherModel.find().lean<Teacher[]>().exec(),
      this.moduleModel.find().lean<CourseModule[]>().exec(),
      this.attendanceModel.find().lean<AttendanceRecord[]>().exec(),
      this.transactionModel.find().lean<Transaction[]>().exec(),
      this.onlineClassModel.find().lean<OnlineClass[]>().exec(),
      this.noticeModel.find().lean<LeanNotice[]>().exec(),
    ]);

    const { summary, kpis, trends } = this.computeKpisAndTrends(
      now,
      students,
      teachers,
      modules,
      attendance,
      transactions,
      classes,
    );
    const activityFeeds = this.computeActivityFeeds(
      now,
      students,
      teachers,
      transactions,
      classes,
      notices,
    );

    return { summary, kpis, trends, activityFeeds };
  }

  async getKpisAndTrends(): Promise<{
    summary: OverviewSummary;
    kpis: OverviewKpis;
    trends: OverviewTrends;
  }> {
    const now = new Date();
    const [students, teachers, modules, attendance, transactions, classes] =
      await Promise.all([
        this.studentModel.find().lean<Student[]>().exec(),
        this.teacherModel.find().lean<Teacher[]>().exec(),
        this.moduleModel.find().lean<CourseModule[]>().exec(),
        this.attendanceModel.find().lean<AttendanceRecord[]>().exec(),
        this.transactionModel.find().lean<Transaction[]>().exec(),
        this.onlineClassModel.find().lean<OnlineClass[]>().exec(),
      ]);

    return this.computeKpisAndTrends(
      now,
      students,
      teachers,
      modules,
      attendance,
      transactions,
      classes,
    );
  }

  async getActivityFeeds(): Promise<OverviewActivityFeeds> {
    const now = new Date();
    const [students, teachers, transactions, classes, notices] =
      await Promise.all([
        this.studentModel.find().lean<Student[]>().exec(),
        this.teacherModel.find().lean<Teacher[]>().exec(),
        this.transactionModel.find().lean<Transaction[]>().exec(),
        this.onlineClassModel.find().lean<OnlineClass[]>().exec(),
        this.noticeModel.find().lean<LeanNotice[]>().exec(),
      ]);

    return this.computeActivityFeeds(
      now,
      students,
      teachers,
      transactions,
      classes,
      notices,
    );
  }

  private computeKpisAndTrends(
    now: Date,
    students: Student[],
    teachers: Teacher[],
    modules: CourseModule[],
    attendance: AttendanceRecord[],
    transactions: Transaction[],
    classes: OnlineClass[],
  ): {
    summary: OverviewSummary;
    kpis: OverviewKpis;
    trends: OverviewTrends;
  } {
    const today = toISODate(now);
    const nowStr = `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const months6 = buildMonths(6, now);
    const incomeVsExpenses: IncomeExpensePoint[] = months6.map((m) => {
      let income = 0;
      let expense = 0;
      for (const tx of transactions) {
        if (!tx.date.startsWith(m.key)) continue;
        if (tx.type === TxType.INCOME) income += tx.amount;
        else if (tx.type === TxType.EXPENSE) expense += tx.amount;
      }
      return { key: m.key, label: m.label, income, expense };
    });

    const months12 = buildMonths(12, now);
    const studentEnrollment: EnrollmentPoint[] = months12.map((m) => ({
      key: m.key,
      label: m.label,
      total: students.filter((s) => s.enrollmentDate <= m.end).length,
      added: students.filter((s) => s.enrollmentDate.startsWith(m.key)).length,
    }));

    const from14 = toISODate(addDays(now, -13));
    const attendanceByDay = new Map<string, AttendanceRecord[]>();
    for (const rec of attendance) {
      if (rec.date < from14 || rec.date > today) continue;
      const list = attendanceByDay.get(rec.date) ?? [];
      list.push(rec);
      attendanceByDay.set(rec.date, list);
    }

    const days: AttendanceTrendPoint[] = [...attendanceByDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, recs]) => {
        const [y, m, d] = date.split('-').map(Number);
        const dt = new Date(y, (m || 1) - 1, d || 1);
        const counts = { present: 0, absent: 0, late: 0, excused: 0 };
        for (const r of recs) counts[r.status] += 1;
        return {
          date,
          label: dt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          rate: computeAttendanceRate(recs),
          ...counts,
        };
      });

    const att14All = attendance.filter(
      (a) => a.date >= from14 && a.date <= today,
    );
    const avgRate = computeAttendanceRate(att14All);

    const todayRecs = attendance.filter((a) => a.date === today);
    const todayRate = computeAttendanceRate(todayRecs);

    const activeStudents = students.filter((s) => s.status === 'active').length;
    const activeTeachers = teachers.filter(
      (t) => t.status === TeacherStatus.ACTIVE,
    ).length;
    const activeModules = modules.filter(
      (m) => m.status === ModuleStatus.ACTIVE,
    ).length;

    const feeMap = new Map(modules.map((m) => [m.id, m.fee]));
    const paidMap = new Map<string, number>();
    for (const tx of transactions) {
      if (
        tx.type === TxType.INCOME &&
        tx.category === 'Tuition fees' &&
        tx.studentId
      ) {
        paidMap.set(tx.studentId, (paidMap.get(tx.studentId) ?? 0) + tx.amount);
      }
    }

    let totalOutstanding = 0;
    let studentsWithBalances = 0;
    for (const student of students) {
      if (student.status === 'graduated') continue;
      const feeTotal = student.moduleIds.reduce(
        (sum, id) => sum + (feeMap.get(id) ?? 0),
        0,
      );
      const out = Math.max(0, feeTotal - (paidMap.get(student.id) ?? 0));
      totalOutstanding += out;
      if (out > 0) studentsWithBalances += 1;
    }

    const classesToday = classes.filter(
      (c) =>
        c.status === ClassStatus.SCHEDULED &&
        c.end >= nowStr &&
        c.start.startsWith(today),
    ).length;

    const curFin = incomeVsExpenses[incomeVsExpenses.length - 1] ?? {
      income: 0,
      expense: 0,
    };
    const prevFin = incomeVsExpenses[incomeVsExpenses.length - 2] ?? {
      income: 0,
      expense: 0,
    };
    const curEnr = studentEnrollment[studentEnrollment.length - 1]?.total ?? 0;
    const prevEnr = studentEnrollment[studentEnrollment.length - 2]?.total ?? 0;

    return {
      summary: {
        classesToday,
        attendanceMarkedToday: todayRecs.length,
        studentsWithPendingFees: studentsWithBalances,
      },
      kpis: {
        totalStudents: {
          value: students.length,
          delta: pctDelta(curEnr, prevEnr),
          spark: studentEnrollment.map((m) => m.total),
        },
        activeStudents: {
          value: activeStudents,
          percentOfEnrollment: students.length
            ? Math.round((activeStudents / students.length) * 100)
            : 0,
          spark: studentEnrollment.map((m) => m.added + 2),
        },
        totalTeachers: {
          value: teachers.length,
          activeTeachers,
        },
        activeModules: {
          value: activeModules,
          totalModules: modules.length,
        },
        todayAttendance: {
          rate: todayRate,
          markedCount: todayRecs.length,
          spark: days.map((d) => d.rate),
        },
        monthlyIncome: {
          value: curFin.income,
          delta: pctDelta(curFin.income, prevFin.income),
          spark: incomeVsExpenses.map((m) => m.income),
        },
        monthlyExpenses: {
          value: curFin.expense,
          delta: pctDelta(curFin.expense, prevFin.expense),
          spark: incomeVsExpenses.map((m) => m.expense),
        },
        outstandingPayments: {
          value: totalOutstanding,
          studentsWithBalances,
        },
      },
      trends: {
        incomeVsExpenses,
        studentEnrollment,
        attendancePercentage: {
          avgRate,
          days,
        },
      },
    };
  }

  private computeActivityFeeds(
    now: Date,
    students: Student[],
    teachers: Teacher[],
    transactions: Transaction[],
    classes: OnlineClass[],
    notices: LeanNotice[],
  ): OverviewActivityFeeds {
    const today = toISODate(now);
    const nowStr = `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const teacherNameById = new Map(teachers.map((t) => [t.id, t.fullName]));
    const studentNameById = new Map(students.map((s) => [s.id, s.fullName]));

    const upcomingClasses: UpcomingClassItem[] = classes
      .filter((c) => c.status === ClassStatus.SCHEDULED && c.end >= nowStr)
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        title: c.title,
        moduleId: c.moduleId,
        teacherId: c.teacherId,
        teacherName: teacherNameById.get(c.teacherId) ?? 'Unassigned',
        batch: c.batch,
        start: c.start,
        end: c.end,
        link: c.link,
        status: c.status,
      }));

    const recentRegistrations: RecentRegistrationItem[] = [...students]
      .sort((a, b) => b.enrollmentDate.localeCompare(a.enrollmentDate))
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        fullName: s.fullName,
        batch: s.batch,
        enrollmentDate: s.enrollmentDate,
        status: s.status,
      }));

    const recentPayments: RecentPaymentItem[] = transactions
      .filter(
        (t) =>
          t.type === TxType.INCOME &&
          t.category === 'Tuition fees' &&
          Boolean(t.studentId),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        studentId: p.studentId ?? '',
        studentName: studentNameById.get(p.studentId ?? '') ?? 'Student',
        amount: p.amount,
        date: p.date,
        method: p.method ?? 'Cash',
        description: p.description,
      }));

    const priorityRank: Record<NoticePriority, number> = {
      [NoticePriority.HIGH]: 0,
      [NoticePriority.MEDIUM]: 1,
      [NoticePriority.LOW]: 2,
    };

    const activeNotices: ActiveNoticeItem[] = notices
      .filter(
        (n) => n.status === NoticeStatus.PUBLISHED && n.expiryDate >= today,
      )
      .sort(
        (a, b) =>
          (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) ||
          b.publishDate.localeCompare(a.publishDate),
      )
      .slice(0, 4)
      .map((n) => ({
        id: n.id || String(n._id ?? ''),
        title: n.title,
        description: n.description ?? '',
        batches: n.batches ?? [],
        publishDate: n.publishDate,
        expiryDate: n.expiryDate,
        priority: n.priority,
        status: n.status,
      }));

    const timeline: ActivityTimelineItem[] = [
      ...recentRegistrations.map((r) => ({
        id: `reg_${r.id}`,
        type: 'registration' as const,
        title: `${r.fullName} enrolled`,
        subtitle: `${r.batch} · ${r.status}`,
        timestamp: r.enrollmentDate,
      })),
      ...recentPayments.map((p) => ({
        id: `pay_${p.id}`,
        type: 'payment' as const,
        title: `Payment from ${p.studentName}`,
        subtitle: `LKR ${Math.round(p.amount).toLocaleString('en-US')} · ${p.method}`,
        timestamp: p.date,
      })),
      ...activeNotices.map((n) => ({
        id: `ntc_${n.id}`,
        type: 'notice' as const,
        title: n.title,
        subtitle: `${n.priority.toUpperCase()} priority · ${n.batches.length ? n.batches.join(', ') : 'All batches'}`,
        timestamp: n.publishDate,
      })),
      ...upcomingClasses.map((c) => ({
        id: `cls_${c.id}`,
        type: 'class' as const,
        title: c.title,
        subtitle: `${c.teacherName} · ${c.batch}`,
        timestamp: c.start,
      })),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 15);

    return {
      upcomingClasses,
      recentRegistrations,
      recentPayments,
      activeNotices,
      timeline,
    };
  }
}
