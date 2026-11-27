import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, Types } from 'mongoose';
import { TxType } from '../enums/status.enum.js';
import type { FinancePeriod } from '../finance/finance.constants.js';
import {
  Transaction,
  type TransactionDocument,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  type CourseModuleDocument,
} from '../modules/schemas/module.schema.js';
import {
  Counter,
  type CounterDocument,
} from '../students/schemas/counter.schema.js';
import {
  Student,
  type StudentDocument,
  type StudentStatus,
} from '../students/schemas/student.schema.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type {
  PaymentsListQueryDto,
  PaymentStudentsQueryDto,
} from './dto/payments-query.dto.js';
import type { UpdatePaymentDto } from './dto/update-payment.dto.js';
import {
  Payment,
  type PaymentDocument,
  type PaymentStatus,
} from './schemas/payment.schema.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StudentPaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface StudentBalanceSummary {
  id: string;
  fullName: string;
  feeTotal: number;
  paidTotal: number;
  outstanding: number;
  paymentStatus: StudentPaymentStatus;
}

export interface PaymentStudentInfo {
  id: string;
  fullName: string;
  batch: string;
  email: string;
}

export interface PaymentItem {
  id: string;
  receiptNo: string;
  studentId: string;
  amount: number;
  discount: number;
  category: string;
  method: string;
  date: string;
  description: string;
  status: PaymentStatus;
  collectedBy?: string;
  transactionId?: string;
  student?: PaymentStudentInfo | null;
}

export interface PaymentStudentListItem {
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

export interface PaymentStudentsResponse {
  items: PaymentStudentListItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    totalStudents: number;
    debtorCount: number;
    settledCount: number;
    totalOutstanding: number;
    totalCollected: number;
  };
}

export interface PaymentsListResponse {
  items: PaymentItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  summary: {
    totalCollected: number;
    totalCount: number;
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

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,

    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,

    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    @InjectModel(CourseModule.name)
    private readonly moduleModel: Model<CourseModuleDocument>,

    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  async getStudentPayments(
    query: PaymentStudentsQueryDto,
  ): Promise<PaymentStudentsResponse> {
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

    const computedAll: PaymentStudentListItem[] = students.map((student) => {
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

    const activeForSummary = computedAll.filter((s) => s.status === 'active');
    const debtorCount = activeForSummary.filter((s) => s.outstanding > 0).length;
    const settledCount = activeForSummary.filter(
      (s) => s.paymentStatus === 'paid',
    ).length;
    const totalOutstanding = activeForSummary.reduce(
      (sum, s) => sum + s.outstanding,
      0,
    );
    const totalCollected = computedAll.reduce(
      (sum, s) => sum + s.paidTotal,
      0,
    );

    let filtered = computedAll;
    if (query.debtorsOnly) {
      filtered = filtered.filter((s) => s.status === 'active' && s.outstanding > 0);
    }
    if (query.paymentStatus) {
      filtered = filtered.filter((s) => s.paymentStatus === query.paymentStatus);
    }

    filtered = filtered.sort(
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
        settledCount,
        totalOutstanding,
        totalCollected,
      },
    };
  }

  async listPayments(
    query: PaymentsListQueryDto,
    now = new Date(),
  ): Promise<PaymentsListResponse> {
    const filter: Record<string, unknown> = {};

    if (query.studentId) filter.studentId = query.studentId;
    if (query.method) filter.method = query.method;
    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;

    if (query.period || query.from || query.to) {
      const range = this.resolveDateRange(query, now);
      filter.date = { $gte: range.from, $lte: range.to };
    }

    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const matchingStudents = await this.studentModel
        .find({ fullName: regex })
        .select('id')
        .lean()
        .exec();
      const matchingStudentIds = matchingStudents.map((s) => s.id);

      const orConditions: Record<string, unknown>[] = [
        { id: regex },
        { receiptNo: regex },
        { studentId: regex },
        { description: regex },
      ];
      if (matchingStudentIds.length > 0) {
        orConditions.push({ studentId: { $in: matchingStudentIds } });
      }
      filter.$or = orConditions;
    }

    const { page, limit } = query;

    const [totalCount, pagedDocs, matchingForSummary] = await Promise.all([
      this.paymentModel.countDocuments(filter).exec(),
      this.paymentModel
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.paymentModel.find(filter).select('amount status').lean().exec(),
    ]);

    const studentIds = Array.from(
      new Set(pagedDocs.map((p) => p.studentId).filter(Boolean)),
    );
    const students =
      studentIds.length > 0
        ? await this.studentModel
            .find({ id: { $in: studentIds } })
            .select('id fullName batch email')
            .lean()
            .exec()
        : [];

    const studentById = new Map<string, PaymentStudentInfo>();
    for (const s of students) {
      studentById.set(s.id, {
        id: s.id,
        fullName: s.fullName,
        batch: s.batch,
        email: s.email,
      });
    }

    const totalCollected = matchingForSummary.reduce(
      (sum, p) =>
        p.status !== 'refunded' && p.status !== 'void' ? sum + p.amount : sum,
      0,
    );

    return {
      items: pagedDocs.map((p) =>
        this.toPaymentItem(p, studentById.get(p.studentId) ?? null),
      ),
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
      },
      summary: {
        totalCollected,
        totalCount,
      },
    };
  }

  async getPaymentById(id: string): Promise<{
    payment: PaymentItem;
    student: PaymentStudentInfo | null;
    studentSummary: StudentBalanceSummary | null;
  }> {
    const existing = await this.paymentModel
      .findOne(this.buildPaymentIdFilter(id))
      .lean()
      .exec();

    if (!existing) {
      throw new NotFoundException(`Payment "${id}" not found`);
    }

    const studentDoc = await this.studentModel
      .findOne({ id: existing.studentId })
      .select('id fullName batch email moduleIds')
      .lean()
      .exec();

    const studentInfo: PaymentStudentInfo | null = studentDoc
      ? {
          id: studentDoc.id,
          fullName: studentDoc.fullName,
          batch: studentDoc.batch,
          email: studentDoc.email,
        }
      : null;

    const studentSummary = studentDoc
      ? await this.computeStudentSummary(studentDoc)
      : null;

    return {
      payment: this.toPaymentItem(existing, studentInfo),
      student: studentInfo,
      studentSummary,
    };
  }

  async createPayment(
    dto: CreatePaymentDto,
    collectedBy?: string,
    now = new Date(),
  ) {
    const student = await this.findStudentByIdOrObjectId(dto.studentId);
    const currentSummary = await this.computeStudentSummary(student);

    if (currentSummary.outstanding <= 0) {
      throw new BadRequestException(
        `Student "${student.id}" has no outstanding balance to pay`,
      );
    }

    if (dto.amount > currentSummary.outstanding) {
      throw new BadRequestException(
        `Payment amount (${dto.amount}) exceeds student's outstanding balance (${currentSummary.outstanding})`,
      );
    }

    const date = dto.date ?? this.todayIso(now);
    const year = now.getUTCFullYear();

    const [paymentId, receiptNo, txId] = await Promise.all([
      this.generateSequenceId('payment', 'PAY', year),
      this.generateSequenceId('receipt', 'RCP', year),
      this.generateSequenceId('transaction', 'TX', year),
    ]);

    const description = dto.description ?? `${dto.category} - ${student.id}`;

    const createdTx = await this.transactionModel.create({
      id: txId,
      type: TxType.INCOME,
      category: dto.category,
      amount: dto.amount,
      date,
      description,
      studentId: student.id,
      method: dto.method,
    });

    const createdPayment = await this.paymentModel.create({
      id: paymentId,
      receiptNo,
      studentId: student.id,
      amount: dto.amount,
      discount: dto.discount ?? 0,
      category: dto.category,
      method: dto.method,
      date,
      description,
      status: 'completed',
      ...(collectedBy ? { collectedBy } : {}),
      transactionId: createdTx.id,
    });

    const studentSummary = await this.computeStudentSummary(student);

    return {
      payment: this.toPaymentItem(createdPayment),
      transaction: {
        id: createdTx.id,
        type: createdTx.type,
        category: createdTx.category,
        amount: createdTx.amount,
        date: createdTx.date,
        description: createdTx.description ?? '',
        studentId: createdTx.studentId,
        method: createdTx.method,
      },
      studentSummary,
    };
  }

  async updatePayment(
    id: string,
    dto: UpdatePaymentDto,
    now = new Date(),
  ): Promise<{
    payment: PaymentItem;
    studentSummary: StudentBalanceSummary | null;
  }> {
    const existing = await this.paymentModel
      .findOne(this.buildPaymentIdFilter(id))
      .lean()
      .exec();

    if (!existing) {
      throw new NotFoundException(`Payment "${id}" not found`);
    }

    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, 1> = {};

    if (dto.amount !== undefined) setFields.amount = dto.amount;
    if (dto.discount !== undefined) setFields.discount = dto.discount;
    if (dto.method !== undefined) setFields.method = dto.method;
    if (dto.category !== undefined) setFields.category = dto.category;
    if (dto.date !== undefined) setFields.date = dto.date;
    if (dto.description !== undefined) setFields.description = dto.description;
    if (dto.status !== undefined) setFields.status = dto.status;

    const targetStatus: PaymentStatus = dto.status ?? existing.status;

    if (targetStatus === 'void' || targetStatus === 'refunded') {
      if (existing.transactionId) {
        await this.transactionModel
          .deleteOne({ id: existing.transactionId })
          .exec();
        unsetFields.transactionId = 1;
      }
    } else if (targetStatus === 'completed') {
      const nextAmount = dto.amount ?? existing.amount;
      const nextCategory = dto.category ?? existing.category;
      const nextMethod = dto.method ?? existing.method;
      const nextDate = dto.date ?? existing.date;
      const nextDescription = dto.description ?? existing.description;

      if (existing.transactionId) {
        const updatedTx = await this.transactionModel
          .findOneAndUpdate(
            { id: existing.transactionId },
            {
              $set: {
                amount: nextAmount,
                category: nextCategory,
                method: nextMethod,
                date: nextDate,
                description: nextDescription,
              },
            },
            { returnDocument: 'after' },
          )
          .lean()
          .exec();

        if (!updatedTx) {
          const newTxId = await this.generateSequenceId(
            'transaction',
            'TX',
            now.getUTCFullYear(),
          );
          await this.transactionModel.create({
            id: newTxId,
            type: TxType.INCOME,
            category: nextCategory,
            amount: nextAmount,
            date: nextDate,
            description: nextDescription,
            studentId: existing.studentId,
            method: nextMethod,
          });
          setFields.transactionId = newTxId;
        }
      } else {
        const newTxId = await this.generateSequenceId(
          'transaction',
          'TX',
          now.getUTCFullYear(),
        );
        await this.transactionModel.create({
          id: newTxId,
          type: TxType.INCOME,
          category: nextCategory,
          amount: nextAmount,
          date: nextDate,
          description: nextDescription,
          studentId: existing.studentId,
          method: nextMethod,
        });
        setFields.transactionId = newTxId;
      }
    }

    let updated = existing;
    if (
      Object.keys(setFields).length > 0 ||
      Object.keys(unsetFields).length > 0
    ) {
      const updateQuery: Record<string, unknown> = {};
      if (Object.keys(setFields).length > 0) updateQuery.$set = setFields;
      if (Object.keys(unsetFields).length > 0) updateQuery.$unset = unsetFields;

      const doc = await this.paymentModel
        .findOneAndUpdate({ _id: existing._id }, updateQuery, {
          returnDocument: 'after',
        })
        .lean()
        .exec();
      if (!doc) {
        throw new NotFoundException(`Payment "${id}" not found`);
      }
      updated = doc;
    }

    const studentDoc = await this.studentModel
      .findOne({ id: updated.studentId })
      .select('id fullName moduleIds')
      .lean()
      .exec();

    const studentSummary = studentDoc
      ? await this.computeStudentSummary(studentDoc)
      : null;

    return {
      payment: this.toPaymentItem(updated),
      studentSummary,
    };
  }

  async deletePayment(id: string): Promise<{
    deleted: true;
    id: string;
    deletedTransactionId: string | null;
    studentSummary: StudentBalanceSummary | null;
  }> {
    const existing = await this.paymentModel
      .findOne(this.buildPaymentIdFilter(id))
      .lean()
      .exec();

    if (!existing) {
      throw new NotFoundException(`Payment "${id}" not found`);
    }

    await this.paymentModel.deleteOne({ _id: existing._id }).exec();

    let deletedTransactionId: string | null = null;
    if (existing.transactionId) {
      await this.transactionModel
        .deleteOne({ id: existing.transactionId })
        .exec();
      deletedTransactionId = existing.transactionId;
    }

    const studentDoc = await this.studentModel
      .findOne({ id: existing.studentId })
      .select('id fullName moduleIds')
      .lean()
      .exec();

    const studentSummary = studentDoc
      ? await this.computeStudentSummary(studentDoc)
      : null;

    return {
      deleted: true,
      id: existing.id,
      deletedTransactionId,
      studentSummary,
    };
  }

  private resolveDateRange(
    query: Pick<PaymentsListQueryDto, 'period' | 'from' | 'to'>,
    now: Date,
  ): { from: string; to: string } {
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
      from = toUtcIsoDate(
        new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth() - 11, 1)),
      );
      to = todayIso;
    } else {
      to = query.to ?? todayIso;
      from = query.from ?? toUtcIsoDate(addUtcDays(parseUtcDate(to), -29));
    }

    if (parseUtcDate(from).getTime() > parseUtcDate(to).getTime()) {
      throw new BadRequestException('from date must be on or before to date');
    }

    return { from, to };
  }

  private async computeStudentSummary(
    student: Pick<Student, 'id' | 'fullName' | 'moduleIds'>,
  ): Promise<StudentBalanceSummary> {
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
      id: student.id,
      fullName: student.fullName,
      feeTotal,
      paidTotal,
      outstanding,
      paymentStatus: this.derivePaymentStatus(feeTotal, paidTotal, outstanding),
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

  private toPaymentItem(
    p: Pick<
      Payment,
      | 'id'
      | 'receiptNo'
      | 'studentId'
      | 'amount'
      | 'discount'
      | 'category'
      | 'method'
      | 'date'
      | 'description'
      | 'status'
      | 'collectedBy'
      | 'transactionId'
    >,
    student?: PaymentStudentInfo | null,
  ): PaymentItem {
    return {
      id: p.id,
      receiptNo: p.receiptNo,
      studentId: p.studentId,
      amount: p.amount,
      discount: p.discount ?? 0,
      category: p.category,
      method: p.method,
      date: p.date,
      description: p.description ?? '',
      status: p.status,
      ...(p.collectedBy ? { collectedBy: p.collectedBy } : {}),
      ...(p.transactionId ? { transactionId: p.transactionId } : {}),
      ...(student !== undefined ? { student } : {}),
    };
  }

  private todayIso(now: Date): string {
    return toUtcIsoDate(
      new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
    );
  }

  private buildPaymentIdFilter(idOrReceiptOrObjectId: string): Record<string, unknown> {
    const trimmed = idOrReceiptOrObjectId.trim();
    if (/^[0-9a-fA-F]{24}$/.test(trimmed) && Types.ObjectId.isValid(trimmed)) {
      return {
        $or: [
          { id: trimmed },
          { receiptNo: trimmed },
          { _id: new Types.ObjectId(trimmed) },
        ],
      };
    }
    return { $or: [{ id: trimmed }, { receiptNo: trimmed }] };
  }

  private buildStudentIdFilter(idOrObjectId: string): Record<string, unknown> {
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
      .findOne(this.buildStudentIdFilter(idOrObjectId))
      .select('id fullName moduleIds')
      .lean()
      .exec();

    if (!student) {
      throw new NotFoundException(`Student "${idOrObjectId}" not found`);
    }

    return student;
  }

  private async generateSequenceId(
    counterPrefix: 'payment' | 'receipt' | 'transaction',
    idPrefix: 'PAY' | 'RCP' | 'TX',
    year: number,
  ): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: `${counterPrefix}:${year}` },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const seq = counter?.seq ?? 1;
    return `${idPrefix}-${year}-${String(seq).padStart(3, '0')}`;
  }
}
