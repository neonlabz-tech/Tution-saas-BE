import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { TxType } from '../enums/status.enum.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import { Student, type StudentDocument } from '../students/schemas/student.schema.js';
import type {
  FinanceChartsQueryDto,
  FinanceKpisQueryDto,
  FinanceTransactionsQueryDto,
} from './dto/finance-query.dto.js';
import type { FinancePeriod } from './finance.constants.js';
import { Transaction, type TransactionDocument } from './schemas/transaction.schema.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAILY_BUCKET_MAX_SPAN = 62;

export interface FinancePeriodRange {
  period: FinancePeriod;
  from: string;
  to: string;
  span: number;
}

export interface FinanceKpis {
  totalIncome: number;
  totalExpense: number;
  netBalance: number;
  totalOutstanding: number;
  totalCount: number;
}

export interface FinanceTransactionItem {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  date: string;
  description: string;
  studentId?: string;
  method?: string;
}

export interface FinanceTransactionsResponse {
  items: FinanceTransactionItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  kpis: FinanceKpis;
  period: FinancePeriodRange;
}

export interface FinanceSeriesBucket {
  key: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface FinanceCategoryBreakdownItem {
  name: string;
  value: number;
}

export interface FinanceChartsResponse {
  period: FinancePeriodRange;
  granularity: 'daily' | 'monthly';
  series: FinanceSeriesBucket[];
  incomeByCategory: FinanceCategoryBreakdownItem[];
  expenseByCategory: FinanceCategoryBreakdownItem[];
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toUtcIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function parseUtcDate(isoDate: string): Date {
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const utc = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(utc.getTime()) ||
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Invalid calendar date: ${isoDate}`);
  }

  return utc;
}

function addUtcDays(date: Date, delta: number): Date {
  return new Date(date.getTime() + delta * MS_PER_DAY);
}

function diffUtcDays(fromIso: string, toIso: string): number {
  const fromUtc = parseUtcDate(fromIso);
  const toUtc = parseUtcDate(toIso);
  return Math.round((toUtc.getTime() - fromUtc.getTime()) / MS_PER_DAY);
}

@Injectable()
export class FinanceService {
  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,
  ) {}

  async getTransactions(
    query: FinanceTransactionsQueryDto,
    now = new Date(),
  ): Promise<FinanceTransactionsResponse> {
    const range = this.resolvePeriodRange(query, now);
    const baseFilter = this.buildBaseFilter(range, query.category);
    const listFilter: Record<string, unknown> = query.type
      ? { ...baseFilter, type: query.type }
      : baseFilter;

    const { page, limit } = query;

    const [matchingForKpis, totalCount, pagedDocs, totalOutstanding] =
      await Promise.all([
        this.transactionModel
          .find(baseFilter)
          .select('type amount')
          .lean()
          .exec(),
        this.transactionModel.countDocuments(listFilter).exec(),
        this.transactionModel
          .find(listFilter)
          .sort({ date: -1, createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean()
          .exec(),
        this.computeGlobalTotalOutstanding(),
      ]);

    const { totalIncome, totalExpense, netBalance } =
      this.summarizeTotals(matchingForKpis);

    return {
      items: pagedDocs.map((tx) => ({
        id: tx.id,
        type: tx.type,
        category: tx.category,
        amount: tx.amount,
        date: tx.date,
        description: tx.description ?? '',
        studentId: tx.studentId,
        method: tx.method,
      })),
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
      kpis: {
        totalIncome,
        totalExpense,
        netBalance,
        totalOutstanding,
        totalCount,
      },
      period: range,
    };
  }

  async getKpis(
    query: FinanceKpisQueryDto,
    now = new Date(),
  ): Promise<{ kpis: FinanceKpis; period: FinancePeriodRange }> {
    const range = this.resolvePeriodRange(query, now);
    const baseFilter = this.buildBaseFilter(range, query.category);

    const [matchingTxs, totalOutstanding] = await Promise.all([
      this.transactionModel
        .find(baseFilter)
        .select('type amount')
        .lean()
        .exec(),
      this.computeGlobalTotalOutstanding(),
    ]);

    const { totalIncome, totalExpense, netBalance } =
      this.summarizeTotals(matchingTxs);

    return {
      kpis: {
        totalIncome,
        totalExpense,
        netBalance,
        totalOutstanding,
        totalCount: matchingTxs.length,
      },
      period: range,
    };
  }

  async getCharts(
    query: FinanceChartsQueryDto,
    now = new Date(),
  ): Promise<FinanceChartsResponse> {
    const range = this.resolvePeriodRange(query, now);
    const baseFilter = this.buildBaseFilter(range, query.category);

    const transactions = await this.transactionModel
      .find(baseFilter)
      .select('type category amount date')
      .lean()
      .exec();

    const granularity: 'daily' | 'monthly' =
      range.span <= DAILY_BUCKET_MAX_SPAN ? 'daily' : 'monthly';

    const series =
      granularity === 'daily'
        ? this.buildDailySeries(range.from, range.to, transactions)
        : this.buildMonthlySeries(range.from, range.to, transactions);

    const incomeTotals = new Map<string, number>();
    const expenseTotals = new Map<string, number>();

    for (const tx of transactions) {
      if (tx.type === TxType.INCOME) {
        incomeTotals.set(
          tx.category,
          (incomeTotals.get(tx.category) ?? 0) + tx.amount,
        );
      } else if (tx.type === TxType.EXPENSE) {
        expenseTotals.set(
          tx.category,
          (expenseTotals.get(tx.category) ?? 0) + tx.amount,
        );
      }
    }

    return {
      period: range,
      granularity,
      series,
      incomeByCategory: this.toSortedBreakdown(incomeTotals),
      expenseByCategory: this.toSortedBreakdown(expenseTotals),
    };
  }

  resolvePeriodRange(
    query: Pick<FinanceKpisQueryDto, 'period' | 'from' | 'to'>,
    now = new Date(),
  ): FinancePeriodRange {
    const todayUtc = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    const todayIso = toUtcIsoDate(todayUtc);

    const period: FinancePeriod =
      query.period ?? (query.from || query.to ? 'custom' : 'month');

    let from: string;
    let to: string;

    if (period === 'week') {
      from = toUtcIsoDate(addUtcDays(todayUtc, -6));
      to = todayIso;
    } else if (period === 'month') {
      from = toUtcIsoDate(addUtcDays(todayUtc, -29));
      to = todayIso;
    } else if (period === 'year') {
      const yearStart = new Date(
        Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 11, 1),
      );
      from = toUtcIsoDate(yearStart);
      to = todayIso;
    } else {
      to = query.to ?? todayIso;
      from = query.from ?? toUtcIsoDate(addUtcDays(parseUtcDate(to), -29));
    }

    const span = diffUtcDays(from, to) + 1;
    if (span < 1) {
      throw new BadRequestException('from date must be on or before to date');
    }

    return { period, from, to, span };
  }

  private buildBaseFilter(
    range: FinancePeriodRange,
    category?: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {
      date: { $gte: range.from, $lte: range.to },
    };

    if (category && category.toLowerCase() !== 'all') {
      filter.category = category;
    }

    return filter;
  }

  private summarizeTotals(
    transactions: Array<Pick<Transaction, 'type' | 'amount'>>,
  ) {
    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of transactions) {
      if (tx.type === TxType.INCOME) {
        totalIncome += tx.amount;
      } else if (tx.type === TxType.EXPENSE) {
        totalExpense += tx.amount;
      }
    }

    return {
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
    };
  }

  private async computeGlobalTotalOutstanding(): Promise<number> {
    const [students, modules, tuitionPayments] = await Promise.all([
      this.studentModel
        .find({ status: { $ne: 'graduated' } })
        .select('id moduleIds')
        .lean()
        .exec(),
      this.moduleModel.find().select('id fee').lean().exec(),
      this.transactionModel
        .find({ type: TxType.INCOME, category: 'Tuition fees' })
        .select('studentId amount')
        .lean()
        .exec(),
    ]);

    const moduleFeeById = new Map<string, number>();
    for (const mod of modules) {
      moduleFeeById.set(mod.id, mod.fee);
    }

    const paidByStudentId = new Map<string, number>();
    for (const tx of tuitionPayments) {
      if (tx.studentId) {
        paidByStudentId.set(
          tx.studentId,
          (paidByStudentId.get(tx.studentId) ?? 0) + tx.amount,
        );
      }
    }

    let totalOutstanding = 0;
    for (const student of students) {
      const feeTotal = (student.moduleIds ?? []).reduce(
        (sum, modId) => sum + (moduleFeeById.get(modId) ?? 0),
        0,
      );
      const paidTotal = paidByStudentId.get(student.id) ?? 0;
      totalOutstanding += Math.max(0, feeTotal - paidTotal);
    }

    return totalOutstanding;
  }

  private buildDailySeries(
    fromIso: string,
    toIso: string,
    transactions: Array<Pick<Transaction, 'type' | 'amount' | 'date'>>,
  ): FinanceSeriesBucket[] {
    const buckets = new Map<string, FinanceSeriesBucket>();
    let cursor = parseUtcDate(fromIso);
    const end = parseUtcDate(toIso);

    while (cursor.getTime() <= end.getTime()) {
      const key = toUtcIsoDate(cursor);
      const label = cursor.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      buckets.set(key, { key, label, income: 0, expense: 0, net: 0 });
      cursor = addUtcDays(cursor, 1);
    }

    for (const tx of transactions) {
      const bucket = buckets.get(tx.date);
      if (!bucket) continue;
      if (tx.type === TxType.INCOME) {
        bucket.income += tx.amount;
      } else if (tx.type === TxType.EXPENSE) {
        bucket.expense += tx.amount;
      }
      bucket.net = bucket.income - bucket.expense;
    }

    return Array.from(buckets.values());
  }

  private buildMonthlySeries(
    fromIso: string,
    toIso: string,
    transactions: Array<Pick<Transaction, 'type' | 'amount' | 'date'>>,
  ): FinanceSeriesBucket[] {
    const startUtc = parseUtcDate(fromIso);
    const endUtc = parseUtcDate(toIso);

    const buckets = new Map<string, FinanceSeriesBucket>();
    let year = startUtc.getUTCFullYear();
    let month = startUtc.getUTCMonth();
    const endYear = endUtc.getUTCFullYear();
    const endMonth = endUtc.getUTCMonth();

    while (year < endYear || (year === endYear && month <= endMonth)) {
      const key = `${year}-${pad2(month + 1)}`;
      const monthDate = new Date(Date.UTC(year, month, 1));
      const label = monthDate.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
      buckets.set(key, { key, label, income: 0, expense: 0, net: 0 });
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }

    for (const tx of transactions) {
      const monthKey = tx.date.slice(0, 7);
      const bucket = buckets.get(monthKey);
      if (!bucket) continue;
      if (tx.type === TxType.INCOME) {
        bucket.income += tx.amount;
      } else if (tx.type === TxType.EXPENSE) {
        bucket.expense += tx.amount;
      }
      bucket.net = bucket.income - bucket.expense;
    }

    return Array.from(buckets.values());
  }

  private toSortedBreakdown(
    totals: Map<string, number>,
  ): FinanceCategoryBreakdownItem[] {
    return Array.from(totals.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }
}
