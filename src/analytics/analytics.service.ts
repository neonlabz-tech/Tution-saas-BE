import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import {
  AttendanceRecord,
  type AttendanceRecordDocument,
} from '../attendance/schemas/attendance.schema.js';
import { AttendanceStatus, TxType } from '../enums/status.enum.js';
import {
  type FinanceCategoryBreakdownItem,
  type FinancePeriodRange,
  type FinanceSeriesBucket,
  FinanceService,
} from '../finance/finance.service.js';
import {
  Transaction,
  type TransactionDocument,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import {
  Teacher,
  type TeacherDocument,
} from '../teachers/schemas/teacher.schema.js';
import type {
  AnalyticsModulePerformanceQueryDto,
  AnalyticsOverviewQueryDto,
} from './dto/analytics-query.dto.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAILY_BUCKET_MAX_SPAN = 62;

export interface AnalyticsKpis {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalOutstanding: number;
  activeStudents: number;
  newEnrollments: number;
  attendanceRate: number;
}

export interface EnrollmentSeriesBucket {
  key: string;
  label: string;
  added: number;
  total: number;
}

export interface AttendanceSeriesBucket {
  key: string;
  label: string;
  rate: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export interface PaymentStatusDonutItem {
  /** unassigned = no module assigned yet, so no fee to pay */
  name: 'paid' | 'partial' | 'unpaid' | 'unassigned';
  value: number;
}

export interface AnalyticsOverviewResponse {
  period: FinancePeriodRange;
  granularity: 'daily' | 'monthly';
  kpis: AnalyticsKpis;
  financeSeries: FinanceSeriesBucket[];
  enrollmentSeries: EnrollmentSeriesBucket[];
  attendanceSeries: AttendanceSeriesBucket[];
  expenseByCategory: FinanceCategoryBreakdownItem[];
  paymentStatusBreakdown: PaymentStatusDonutItem[];
}

export interface ModulePerformanceItem {
  id: string;
  code: string;
  name: string;
  fee: number;
  status: string;
  teacherId: string | null;
  teacher: { id: string; fullName: string } | null;
  enrolledCount: number;
  expectedRevenue: number;
  collected: number;
  owed: number;
  collectionRate: number;
  attendanceRate: number;
}

export interface ModulePerformanceResponse {
  period: FinancePeriodRange | null;
  items: ModulePerformanceItem[];
  summary: {
    totalModules: number;
    totalEnrolled: number;
    totalExpectedRevenue: number;
    totalCollected: number;
    totalOwed: number;
    averageAttendanceRate: number;
  };
}

interface BucketMeta {
  key: string;
  label: string;
  endDate: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtcIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parseUtcDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function computeAttendanceRate(
  present: number,
  late: number,
  absent: number,
): number {
  const nonExcused = present + late + absent;
  if (nonExcused === 0) return 0;
  return Math.round(((present + late) / nonExcused) * 1000) / 10;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,

    @InjectModel(AttendanceRecord.name)
    private readonly attendanceModel: Model<AttendanceRecordDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    @InjectModel(Teacher.name)
    private readonly teacherModel: Model<TeacherDocument>,

    private readonly financeService: FinanceService,
  ) {}

  async getOverview(
    query: AnalyticsOverviewQueryDto,
    now = new Date(),
  ): Promise<AnalyticsOverviewResponse> {
    const range = this.financeService.resolvePeriodRange(query, now);
    const granularity: 'daily' | 'monthly' =
      range.span <= DAILY_BUCKET_MAX_SPAN ? 'daily' : 'monthly';
    const bucketMetas = this.buildBucketMetas(
      range.from,
      range.to,
      granularity,
    );

    const studentFilter: Record<string, unknown> = {
      enrollmentDate: { $lte: range.to },
    };
    if (query.batch) studentFilter.batch = query.batch;
    if (query.moduleId) studentFilter.moduleIds = query.moduleId;

    const attendanceFilter: Record<string, unknown> = {
      date: { $gte: range.from, $lte: range.to },
    };
    if (query.moduleId) attendanceFilter.moduleId = query.moduleId;

    const [
      students,
      modules,
      periodTransactions,
      allTuitionPayments,
      attendanceRecords,
    ] = await Promise.all([
      this.studentModel
        .find(studentFilter)
        .select('id status moduleIds enrollmentDate')
        .lean()
        .exec(),
      this.moduleModel.find().select('id fee').lean().exec(),
      this.transactionModel
        .find({ date: { $gte: range.from, $lte: range.to } })
        .select('type category amount date')
        .lean()
        .exec(),
      this.transactionModel
        .find({
          type: TxType.INCOME,
          category: 'Tuition fees',
          date: { $gte: range.from, $lte: range.to },
        })
        .select('studentId amount')
        .lean()
        .exec(),
      this.attendanceModel
        .find(attendanceFilter)
        .select('date status')
        .lean()
        .exec(),
    ]);

    let totalIncome = 0;
    let totalExpense = 0;
    const expenseByCat = new Map<string, number>();

    for (const tx of periodTransactions) {
      if (tx.type === TxType.INCOME) {
        totalIncome += tx.amount;
      } else if (tx.type === TxType.EXPENSE) {
        totalExpense += tx.amount;
        expenseByCat.set(
          tx.category,
          (expenseByCat.get(tx.category) ?? 0) + tx.amount,
        );
      }
    }

    const moduleFeeById = new Map(modules.map((m) => [m.id, m.fee]));
    const tuitionPaidByStudent = new Map<string, number>();
    for (const tx of allTuitionPayments) {
      if (tx.studentId) {
        tuitionPaidByStudent.set(
          tx.studentId,
          (tuitionPaidByStudent.get(tx.studentId) ?? 0) + tx.amount,
        );
      }
    }

    let totalOutstanding = 0;
    let activeStudents = 0;
    let newEnrollments = 0;
    const paymentStatusCounts: Record<PaymentStatusDonutItem['name'], number> = {
      paid: 0,
      partial: 0,
      unpaid: 0,
      unassigned: 0,
    };

    for (const student of students) {
      if (student.status === 'active') activeStudents += 1;
      if (
        student.enrollmentDate >= range.from &&
        student.enrollmentDate <= range.to
      ) {
        newEnrollments += 1;
      }

      if (student.status !== 'graduated') {
        const feeTotal = (student.moduleIds ?? []).reduce(
          (sum, modId) => sum + (moduleFeeById.get(modId) ?? 0),
          0,
        );
        const paidTotal = tuitionPaidByStudent.get(student.id) ?? 0;
        const outstanding = Math.max(0, feeTotal - paidTotal);
        totalOutstanding += outstanding;

        // No module assigned yet (e.g. new students) → own slice, not "unpaid".
        if ((student.moduleIds ?? []).length === 0) {
          paymentStatusCounts.unassigned += 1;
        } else if (outstanding === 0) {
          paymentStatusCounts.paid += 1;
        } else if (paidTotal > 0 && outstanding > 0) {
          paymentStatusCounts.partial += 1;
        } else {
          paymentStatusCounts.unpaid += 1;
        }
      }
    }

    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    for (const rec of attendanceRecords) {
      if (rec.status === AttendanceStatus.PRESENT) totalPresent += 1;
      else if (rec.status === AttendanceStatus.LATE) totalLate += 1;
      else if (rec.status === AttendanceStatus.ABSENT) totalAbsent += 1;
    }

    const financeSeries = this.buildFinanceSeries(
      bucketMetas,
      granularity,
      periodTransactions,
    );
    const enrollmentSeries = this.buildEnrollmentSeries(
      bucketMetas,
      granularity,
      students,
    );
    const attendanceSeries = this.buildAttendanceSeries(
      bucketMetas,
      granularity,
      attendanceRecords,
    );

    const expenseByCategory = Array.from(expenseByCat.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const paymentStatusBreakdown: PaymentStatusDonutItem[] = [
      { name: 'paid', value: paymentStatusCounts.paid },
      { name: 'partial', value: paymentStatusCounts.partial },
      { name: 'unpaid', value: paymentStatusCounts.unpaid },
      { name: 'unassigned', value: paymentStatusCounts.unassigned },
    ];

    return {
      period: range,
      granularity,
      kpis: {
        totalIncome,
        totalExpense,
        netBalance: totalIncome - totalExpense,
        totalOutstanding,
        activeStudents,
        newEnrollments,
        attendanceRate: computeAttendanceRate(
          totalPresent,
          totalLate,
          totalAbsent,
        ),
      },
      financeSeries,
      enrollmentSeries,
      attendanceSeries,
      expenseByCategory,
      paymentStatusBreakdown,
    };
  }

  async getModulePerformance(
    query: AnalyticsModulePerformanceQueryDto,
    now = new Date(),
  ): Promise<ModulePerformanceResponse> {
    const hasPeriod = Boolean(query.period || query.from || query.to);
    const range = hasPeriod
      ? this.financeService.resolvePeriodRange(query, now)
      : null;

    const moduleFilter: Record<string, unknown> = {};
    if (query.status) moduleFilter.status = query.status;

    const attendanceFilter: Record<string, unknown> = {};
    if (range) {
      attendanceFilter.date = { $gte: range.from, $lte: range.to };
    }

    const tuitionFilter: Record<string, unknown> = {
      type: TxType.INCOME,
      category: 'Tuition fees',
    };
    if (range) {
      tuitionFilter.date = { $gte: range.from, $lte: range.to };
    }

    const [
      modules,
      allModulesForFees,
      teachers,
      students,
      tuitionPayments,
      attendanceRecords,
    ] = await Promise.all([
      this.moduleModel
        .find(moduleFilter)
        .select('id code name fee status teacherId')
        .lean()
        .exec(),
      this.moduleModel.find().select('id fee').lean().exec(),
      this.teacherModel.find().select('id fullName').lean().exec(),
      this.studentModel
        .find(range ? { enrollmentDate: { $lte: range.to } } : {})
        .select('id moduleIds')
        .lean()
        .exec(),
      this.transactionModel
        .find(tuitionFilter)
        .select('studentId amount')
        .lean()
        .exec(),
      this.attendanceModel
        .find(attendanceFilter)
        .select('moduleId status')
        .lean()
        .exec(),
    ]);

    const teacherById = new Map(
      teachers.map((t) => [t.id, { id: t.id, fullName: t.fullName }]),
    );
    const feeByModuleId = new Map(allModulesForFees.map((m) => [m.id, m.fee]));

    const paidByStudentId = new Map<string, number>();
    for (const tx of tuitionPayments) {
      if (tx.studentId) {
        paidByStudentId.set(
          tx.studentId,
          (paidByStudentId.get(tx.studentId) ?? 0) + tx.amount,
        );
      }
    }

    const studentFeeTotalById = new Map<string, number>();
    const studentsByModuleId = new Map<string, string[]>();
    for (const student of students) {
      const modIds = student.moduleIds ?? [];
      const feeTotal = modIds.reduce(
        (sum, modId) => sum + (feeByModuleId.get(modId) ?? 0),
        0,
      );
      studentFeeTotalById.set(student.id, feeTotal);

      for (const modId of modIds) {
        const list = studentsByModuleId.get(modId) ?? [];
        list.push(student.id);
        studentsByModuleId.set(modId, list);
      }
    }

    const attendanceByModuleId = new Map<
      string,
      { present: number; late: number; absent: number }
    >();
    for (const rec of attendanceRecords) {
      const entry = attendanceByModuleId.get(rec.moduleId) ?? {
        present: 0,
        late: 0,
        absent: 0,
      };
      if (rec.status === AttendanceStatus.PRESENT) entry.present += 1;
      else if (rec.status === AttendanceStatus.LATE) entry.late += 1;
      else if (rec.status === AttendanceStatus.ABSENT) entry.absent += 1;
      attendanceByModuleId.set(rec.moduleId, entry);
    }

    const items: ModulePerformanceItem[] = modules.map((mod) => {
      const enrolledStudentIds = studentsByModuleId.get(mod.id) ?? [];
      const enrolledCount = enrolledStudentIds.length;
      const expectedRevenue = mod.fee * enrolledCount;

      let collectedRaw = 0;
      let owedRaw = 0;

      for (const studentId of enrolledStudentIds) {
        const studentFeeTotal = studentFeeTotalById.get(studentId) ?? 0;
        const studentPaid = paidByStudentId.get(studentId) ?? 0;
        const rawShare =
          studentFeeTotal > 0 ? studentPaid * (mod.fee / studentFeeTotal) : 0;
        const share = Math.min(mod.fee, rawShare);
        collectedRaw += share;
        owedRaw += Math.max(0, mod.fee - share);
      }

      const collected = Math.round(collectedRaw * 100) / 100;
      const owed = Math.round(owedRaw * 100) / 100;
      const collectionRate =
        expectedRevenue > 0
          ? Math.round((collected / expectedRevenue) * 1000) / 10
          : 0;

      const att = attendanceByModuleId.get(mod.id) ?? {
        present: 0,
        late: 0,
        absent: 0,
      };
      const attendanceRate = computeAttendanceRate(
        att.present,
        att.late,
        att.absent,
      );

      return {
        id: mod.id,
        code: mod.code,
        name: mod.name,
        fee: mod.fee,
        status: mod.status,
        teacherId: mod.teacherId ?? null,
        teacher: mod.teacherId ? (teacherById.get(mod.teacherId) ?? null) : null,
        enrolledCount,
        expectedRevenue,
        collected,
        owed,
        collectionRate,
        attendanceRate,
      };
    });

    items.sort((a, b) => b.enrolledCount - a.enrolledCount);

    const totalEnrolled = items.reduce((sum, i) => sum + i.enrolledCount, 0);
    const totalExpectedRevenue = items.reduce(
      (sum, i) => sum + i.expectedRevenue,
      0,
    );
    const totalCollected =
      Math.round(items.reduce((sum, i) => sum + i.collected, 0) * 100) / 100;
    const totalOwed =
      Math.round(items.reduce((sum, i) => sum + i.owed, 0) * 100) / 100;
    const averageAttendanceRate =
      items.length > 0
        ? Math.round(
            (items.reduce((sum, i) => sum + i.attendanceRate, 0) /
              items.length) *
              10,
          ) / 10
        : 0;

    return {
      period: range,
      items,
      summary: {
        totalModules: items.length,
        totalEnrolled,
        totalExpectedRevenue,
        totalCollected,
        totalOwed,
        averageAttendanceRate,
      },
    };
  }

  private buildBucketMetas(
    fromIso: string,
    toIso: string,
    granularity: 'daily' | 'monthly',
  ): BucketMeta[] {
    const metas: BucketMeta[] = [];
    const start = parseUtcDate(fromIso);
    const end = parseUtcDate(toIso);

    if (granularity === 'daily') {
      let cursor = start;
      while (cursor.getTime() <= end.getTime()) {
        const key = toUtcIsoDate(cursor);
        const label = cursor.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: 'UTC',
        });
        metas.push({ key, label, endDate: key });
        cursor = new Date(cursor.getTime() + MS_PER_DAY);
      }
      return metas;
    }

    let year = start.getUTCFullYear();
    let month = start.getUTCMonth();
    const endYear = end.getUTCFullYear();
    const endMonth = end.getUTCMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      const key = `${year}-${pad2(month + 1)}`;
      const monthStart = new Date(Date.UTC(year, month, 1));
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const endDate =
        year === endYear && month === endMonth ? toIso : toUtcIsoDate(monthEnd);
      const label = monthStart.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
      metas.push({ key, label, endDate });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    return metas;
  }

  private buildFinanceSeries(
    metas: BucketMeta[],
    granularity: 'daily' | 'monthly',
    transactions: Array<Pick<Transaction, 'type' | 'amount' | 'date'>>,
  ): FinanceSeriesBucket[] {
    const buckets = new Map<string, FinanceSeriesBucket>(
      metas.map((m) => [
        m.key,
        { key: m.key, label: m.label, income: 0, expense: 0, net: 0 },
      ]),
    );

    for (const tx of transactions) {
      const key = granularity === 'daily' ? tx.date : tx.date.slice(0, 7);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (tx.type === TxType.INCOME) bucket.income += tx.amount;
      else if (tx.type === TxType.EXPENSE) bucket.expense += tx.amount;
      bucket.net = bucket.income - bucket.expense;
    }

    return Array.from(buckets.values());
  }

  private buildEnrollmentSeries(
    metas: BucketMeta[],
    granularity: 'daily' | 'monthly',
    students: Array<Pick<Student, 'enrollmentDate'>>,
  ): EnrollmentSeriesBucket[] {
    const addedMap = new Map<string, number>();
    for (const student of students) {
      const key =
        granularity === 'daily'
          ? student.enrollmentDate
          : student.enrollmentDate.slice(0, 7);
      addedMap.set(key, (addedMap.get(key) ?? 0) + 1);
    }

    return metas.map((meta) => ({
      key: meta.key,
      label: meta.label,
      added: addedMap.get(meta.key) ?? 0,
      total: students.filter((s) => s.enrollmentDate <= meta.endDate).length,
    }));
  }

  private buildAttendanceSeries(
    metas: BucketMeta[],
    granularity: 'daily' | 'monthly',
    records: Array<Pick<AttendanceRecord, 'date' | 'status'>>,
  ): AttendanceSeriesBucket[] {
    const buckets = new Map<string, AttendanceSeriesBucket>(
      metas.map((m) => [
        m.key,
        {
          key: m.key,
          label: m.label,
          rate: 0,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
        },
      ]),
    );

    for (const rec of records) {
      const key = granularity === 'daily' ? rec.date : rec.date.slice(0, 7);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (rec.status === AttendanceStatus.PRESENT) bucket.present += 1;
      else if (rec.status === AttendanceStatus.LATE) bucket.late += 1;
      else if (rec.status === AttendanceStatus.ABSENT) bucket.absent += 1;
      else if (rec.status === AttendanceStatus.EXCUSED) bucket.excused += 1;
      bucket.rate = computeAttendanceRate(
        bucket.present,
        bucket.late,
        bucket.absent,
      );
    }

    return Array.from(buckets.values());
  }
}
