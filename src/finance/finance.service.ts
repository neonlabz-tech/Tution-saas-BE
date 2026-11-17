import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { TxType } from '../enums/status.enum.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import { Counter, type CounterDocument } from '../students/schemas/counter.schema.js';
import {
  Student,
  type StudentDocument,
  type StudentStatus,
} from '../students/schemas/student.schema.js';
import {
  type CreateTransactionDto,
  isValidCategoryForType,
} from './dto/create-transaction.dto.js';
import type {
  FinanceChartsQueryDto,
  FinanceKpisQueryDto,
  FinanceTransactionsQueryDto,
  StudentPaymentsQueryDto,
} from './dto/finance-query.dto.js';
import type { RecordStudentPaymentDto } from './dto/record-student-payment.dto.js';
import type { UpdateTransactionDto } from './dto/update-transaction.dto.js';
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

export type StudentPaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface StudentPaymentSummaryItem {
  id: string;
  fullName: string;
  email: string;
  batch: string;
  status: StudentStatus;
  moduleIds: string[];
  feeTotal: number;
  paidTotal: number;
  outstanding: number;
  paymentStatus: StudentPaymentStatus;
  lastPaymentDate: string | null;
  lastPaymentAmount: number | null;
}

export interface StudentPaymentsResponse {
  items: StudentPaymentSummaryItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    totalStudents: number;
    debtorCount: number;
    totalOutstanding: number;
  };
}

export interface RecordStudentPaymentResponse {
  transaction: FinanceTransactionItem;
  studentSummary: {
    id: string;
    fullName: string;
    feeTotal: number;
    paidTotal: number;
    outstanding: number;
    paymentStatus: StudentPaymentStatus;
  };
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

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
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
      items: pagedDocs.map((tx) => this.toTransactionItem(tx)),
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

  async createTransaction(
    dto: CreateTransactionDto,
    now = new Date(),
  ): Promise<FinanceTransactionItem> {
    let resolvedStudentId: string | undefined;
    if (dto.studentId) {
      const student = await this.findStudentByIdOrObjectId(dto.studentId);
      resolvedStudentId = student.id;
    }

    const date = dto.date ?? this.todayIso(now);
    const id = await this.generateNextTransactionId(now.getUTCFullYear());

    const created = await this.transactionModel.create({
      id,
      type: dto.type,
      category: dto.category,
      amount: dto.amount,
      date,
      description: dto.description ?? '',
      studentId: resolvedStudentId,
      method: dto.method,
    });

    return this.toTransactionItem(created);
  }

  async updateTransaction(
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<FinanceTransactionItem> {
    const existing = await this.transactionModel
      .findOne(this.buildIdFilter(id))
      .lean()
      .exec();

    if (!existing) {
      throw new NotFoundException(`Transaction "${id}" not found`);
    }

    const effectiveType = dto.type ?? existing.type;
    const effectiveCategory = dto.category ?? existing.category;
    if (!isValidCategoryForType(effectiveType, effectiveCategory)) {
      throw new BadRequestException(
        `Category "${effectiveCategory}" is not valid for type "${effectiveType}"`,
      );
    }

    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, 1> = {};

    if (dto.type !== undefined) setFields.type = dto.type;
    if (dto.category !== undefined) setFields.category = dto.category;
    if (dto.amount !== undefined) setFields.amount = dto.amount;
    if (dto.date !== undefined) setFields.date = dto.date;
    if (dto.description !== undefined) setFields.description = dto.description;
    if (dto.method !== undefined) setFields.method = dto.method;

    if (dto.studentId === null) {
      unsetFields.studentId = 1;
    } else if (dto.studentId !== undefined) {
      const student = await this.findStudentByIdOrObjectId(dto.studentId);
      setFields.studentId = student.id;
    }

    if (
      Object.keys(setFields).length === 0 &&
      Object.keys(unsetFields).length === 0
    ) {
      return this.toTransactionItem(existing);
    }

    const updateQuery: Record<string, unknown> = {};
    if (Object.keys(setFields).length > 0) updateQuery.$set = setFields;
    if (Object.keys(unsetFields).length > 0) updateQuery.$unset = unsetFields;

    const updated = await this.transactionModel
      .findOneAndUpdate({ _id: existing._id }, updateQuery, {
        returnDocument: 'after',
      })
      .lean()
      .exec();

    if (!updated) {
      throw new NotFoundException(`Transaction "${id}" not found`);
    }

    return this.toTransactionItem(updated);
  }

  async deleteTransaction(id: string): Promise<{ deleted: true; id: string }> {
    const existing = await this.transactionModel
      .findOne(this.buildIdFilter(id))
      .lean()
      .exec();

    if (!existing) {
      throw new NotFoundException(`Transaction "${id}" not found`);
    }

    await this.transactionModel.deleteOne({ _id: existing._id }).exec();

    return {
      deleted: true,
      id: existing.id,
    };
  }

  async getStudentPayments(
    query: StudentPaymentsQueryDto,
  ): Promise<StudentPaymentsResponse> {
    const studentFilter: Record<string, unknown> = {};

    if (query.status) {
      studentFilter.status = query.status;
    } else if (!query.includeGraduated) {
      studentFilter.status = { $ne: 'graduated' };
    }

    if (query.batch) {
      studentFilter.batch = query.batch;
    }

    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      studentFilter.$or = [{ fullName: regex }, { id: regex }, { email: regex }];
    }

    const [students, modules, incomeTransactions] = await Promise.all([
      this.studentModel
        .find(studentFilter)
        .select('id fullName email batch status moduleIds')
        .lean()
        .exec(),
      this.moduleModel.find().select('id fee').lean().exec(),
      this.transactionModel
        .find({
          type: TxType.INCOME,
          studentId: { $exists: true, $ne: null },
        })
        .select('studentId category amount date')
        .sort({ date: -1, createdAt: -1 })
        .lean()
        .exec(),
    ]);

    const moduleFeeById = new Map<string, number>();
    for (const mod of modules) {
      moduleFeeById.set(mod.id, mod.fee);
    }

    const tuitionPaidByStudentId = new Map<string, number>();
    const lastPaymentByStudentId = new Map<
      string,
      { date: string; amount: number }
    >();

    for (const tx of incomeTransactions) {
      if (!tx.studentId) continue;
      if (tx.category === 'Tuition fees') {
        tuitionPaidByStudentId.set(
          tx.studentId,
          (tuitionPaidByStudentId.get(tx.studentId) ?? 0) + tx.amount,
        );
      }
      if (!lastPaymentByStudentId.has(tx.studentId)) {
        lastPaymentByStudentId.set(tx.studentId, {
          date: tx.date,
          amount: tx.amount,
        });
      }
    }

    const computedAll: StudentPaymentSummaryItem[] = students.map((student) => {
      const feeTotal = (student.moduleIds ?? []).reduce(
        (sum, modId) => sum + (moduleFeeById.get(modId) ?? 0),
        0,
      );
      const paidTotal = tuitionPaidByStudentId.get(student.id) ?? 0;
      const outstanding = Math.max(0, feeTotal - paidTotal);
      const lastPayment = lastPaymentByStudentId.get(student.id) ?? null;

      return {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        batch: student.batch,
        status: student.status,
        moduleIds: student.moduleIds ?? [],
        feeTotal,
        paidTotal,
        outstanding,
        paymentStatus: this.derivePaymentStatus(feeTotal, paidTotal, outstanding),
        lastPaymentDate: lastPayment?.date ?? null,
        lastPaymentAmount: lastPayment?.amount ?? null,
      };
    });

    const debtorCount = computedAll.filter((s) => s.outstanding > 0).length;
    const totalOutstanding = computedAll.reduce(
      (sum, s) => sum + s.outstanding,
      0,
    );

    const filtered = (
      query.debtorsOnly
        ? computedAll.filter((s) => s.outstanding > 0)
        : computedAll
    ).sort(
      (a, b) =>
        b.outstanding - a.outstanding || a.fullName.localeCompare(b.fullName),
    );

    const { page, limit } = query;
    const total = filtered.length;
    const items = filtered.slice((page - 1) * limit, page * limit);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      summary: {
        totalStudents: computedAll.length,
        debtorCount,
        totalOutstanding,
      },
    };
  }

  async recordStudentPayment(
    dto: RecordStudentPaymentDto,
    now = new Date(),
  ): Promise<RecordStudentPaymentResponse> {
    const student = await this.findStudentByIdOrObjectId(dto.studentId);
    const date = dto.date ?? this.todayIso(now);
    const id = await this.generateNextTransactionId(now.getUTCFullYear());

    const created = await this.transactionModel.create({
      id,
      type: TxType.INCOME,
      category: dto.category,
      amount: dto.amount,
      date,
      description: dto.description ?? `${dto.category} - ${student.id}`,
      studentId: student.id,
      method: dto.method,
    });

    const [modules, tuitionPayments] = await Promise.all([
      student.moduleIds?.length
        ? this.moduleModel
            .find({ id: { $in: student.moduleIds } })
            .select('fee')
            .lean()
            .exec()
        : Promise.resolve([]),
      this.transactionModel
        .find({
          type: TxType.INCOME,
          category: 'Tuition fees',
          studentId: student.id,
        })
        .select('amount')
        .lean()
        .exec(),
    ]);

    const feeTotal = modules.reduce((sum, m) => sum + m.fee, 0);
    const paidTotal = tuitionPayments.reduce((sum, tx) => sum + tx.amount, 0);
    const outstanding = Math.max(0, feeTotal - paidTotal);

    return {
      transaction: this.toTransactionItem(created),
      studentSummary: {
        id: student.id,
        fullName: student.fullName,
        feeTotal,
        paidTotal,
        outstanding,
        paymentStatus: this.derivePaymentStatus(feeTotal, paidTotal, outstanding),
      },
    };
  }

  private derivePaymentStatus(
    feeTotal: number,
    paidTotal: number,
    outstanding: number,
  ): StudentPaymentStatus {
    if (outstanding === 0 && (feeTotal > 0 || paidTotal > 0)) {
      return 'paid';
    }
    if (paidTotal > 0 && outstanding > 0) {
      return 'partial';
    }
    return 'unpaid';
  }

  private toTransactionItem(
    tx: Pick<
      Transaction,
      | 'id'
      | 'type'
      | 'category'
      | 'amount'
      | 'date'
      | 'description'
      | 'studentId'
      | 'method'
    >,
  ): FinanceTransactionItem {
    return {
      id: tx.id,
      type: tx.type,
      category: tx.category,
      amount: tx.amount,
      date: tx.date,
      description: tx.description ?? '',
      studentId: tx.studentId,
      method: tx.method,
    };
  }

  private todayIso(now: Date): string {
    return toUtcIsoDate(
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    );
  }

  private buildIdFilter(idOrObjectId: string): Record<string, unknown> {
    const trimmed = idOrObjectId.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed) && Types.ObjectId.isValid(trimmed)) {
      return { $or: [{ id: trimmed }, { _id: new Types.ObjectId(trimmed) }] };
    }
    return { id: trimmed };
  }

  private async findStudentByIdOrObjectId(
    idOrObjectId: string,
  ): Promise<Pick<Student, 'id' | 'fullName' | 'moduleIds'>> {
    const student = await this.studentModel
      .findOne(this.buildIdFilter(idOrObjectId))
      .select('id fullName moduleIds')
      .lean()
      .exec();

    if (!student) {
      throw new NotFoundException(`Student "${idOrObjectId}" not found`);
    }

    return student;
  }

  private async generateNextTransactionId(year: number): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: `transaction:${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const seq = counter?.seq ?? 1;
    return `TX-${year}-${String(seq).padStart(3, '0')}`;
  }
}
