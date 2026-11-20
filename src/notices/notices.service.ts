import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter, Types } from 'mongoose';
import {
  NoticePriority,
  NoticeState,
  NoticeStatus,
} from '../enums/status.enum.js';
import {
  Counter,
  type CounterDocument,
} from '../students/schemas/counter.schema.js';
import { CreateNoticeDto, ISO_DATE_REGEX } from './dto/create-notice.dto.js';
import { QueryNoticeDto } from './dto/query-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { Notice, type NoticeDocument } from './schemas/notice.schema.js';

export interface NoticeView {
  id: string;
  title: string;
  description: string;
  allBatches: boolean;
  batches: string[];
  publishDate: string;
  expiryDate: string;
  priority: NoticePriority;
  status: NoticeStatus;
  state: NoticeState;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * States that have their own filter option and count. Expired notices are
 * still returned to admins (under "all"), but hidden from other portals.
 */
export const VISIBLE_STATES = [
  NoticeState.ACTIVE,
  NoticeState.SCHEDULED,
  NoticeState.DRAFT,
] as const;
export type VisibleNoticeState = (typeof VISIBLE_STATES)[number];

export type NoticeCounts = Record<'all' | VisibleNoticeState, number>;

export interface NoticeListResult {
  items: NoticeView[];
  counts: NoticeCounts;
}

export interface NoticeFindOptions {
  /** Restrict to currently live notices (used for non-admin viewers). */
  activeOnly?: boolean;
}

type LeanNotice = Notice & {
  _id?: unknown;
  __v?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
};

const NOTICE_COUNTER_KEY = 'notice';

/** Today's date (YYYY-MM-DD) using the server's system time zone. */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeNoticeState(
  n: Pick<Notice, 'status' | 'publishDate' | 'expiryDate'>,
  today: string,
): NoticeState {
  if (n.status === NoticeStatus.DRAFT) return NoticeState.DRAFT;
  if (n.publishDate > today) return NoticeState.SCHEDULED;
  if (n.expiryDate < today) return NoticeState.EXPIRED;
  return NoticeState.ACTIVE;
}

function stateFilter(state: VisibleNoticeState, today: string): QueryFilter<Notice> {
  switch (state) {
    case NoticeState.DRAFT:
      return { status: NoticeStatus.DRAFT };
    case NoticeState.SCHEDULED:
      return { status: NoticeStatus.PUBLISHED, publishDate: { $gt: today } };
    case NoticeState.ACTIVE:
      return {
        status: NoticeStatus.PUBLISHED,
        publishDate: { $lte: today },
        expiryDate: { $gte: today },
      };
  }
}

/** Notices with `allBatches` (or legacy empty `batches`) target everyone. */
const ALL_BATCHES_CONDITIONS: QueryFilter<Notice>[] = [
  { allBatches: true },
  { batches: { $size: 0 } },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRealDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

@Injectable()
export class NoticesService implements OnModuleInit {
  private readonly logger = new Logger(NoticesService.name);

  constructor(
    @InjectModel(Notice.name)
    private readonly noticeModel: Model<NoticeDocument>,
    @InjectModel(Counter.name)
    private readonly counterModel: Model<CounterDocument>,
  ) {}

  /**
   * On boot: backfill legacy notices (created before this module existed),
   * then ensure indexes. Backfill must run first, otherwise the unique `id`
   * index fails on several docs with a missing id.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.backfillLegacyNotices();
    } catch (err) {
      this.logger.warn(`Could not backfill legacy notices: ${String(err)}`);
    }
    try {
      await this.noticeModel.createIndexes();
    } catch (err) {
      this.logger.warn(`Could not ensure notice indexes: ${String(err)}`);
    }
  }

  /** Gives legacy docs an NTC-xxx id and an explicit allBatches flag. Idempotent. */
  async backfillLegacyNotices(): Promise<{ ids: number; allBatches: number }> {
    const missingId = await this.noticeModel
      .find({ $or: [{ id: { $exists: false } }, { id: null }, { id: '' }] })
      .sort({ createdAt: 1 })
      .lean<LeanNotice[]>()
      .exec();

    for (const doc of missingId) {
      const id = await this.generateNextNoticeId();
      await this.noticeModel
        .updateOne({ _id: doc._id as Types.ObjectId }, { $set: { id } })
        .exec();
      this.logger.log(`Backfilled notice id ${id}`);
    }

    const [allTrue, allFalse] = await Promise.all([
      this.noticeModel
        .updateMany(
          { allBatches: { $exists: false }, $or: [{ batches: { $size: 0 } }, { batches: { $exists: false } }] },
          { $set: { allBatches: true, batches: [] } },
        )
        .exec(),
      this.noticeModel
        .updateMany(
          { allBatches: { $exists: false }, 'batches.0': { $exists: true } },
          { $set: { allBatches: false } },
        )
        .exec(),
    ]);

    const flagged = (allTrue.modifiedCount ?? 0) + (allFalse.modifiedCount ?? 0);
    if (flagged) this.logger.log(`Backfilled allBatches on ${flagged} notice(s)`);
    return { ids: missingId.length, allBatches: flagged };
  }

  async findAll(
    query: QueryNoticeDto = {},
    options: NoticeFindOptions = {},
  ): Promise<NoticeListResult> {
    const today = todayISO();
    const conditions: QueryFilter<Notice>[] = [];

    if (query.priority) conditions.push({ priority: query.priority });

    if (query.batch) {
      conditions.push({
        $or: [...ALL_BATCHES_CONDITIONS, { batches: query.batch }],
      });
    }

    if (query.q) {
      const regex = new RegExp(escapeRegex(query.q), 'i');
      conditions.push({ $or: [{ title: regex }, { description: regex }] });
    }

    const state = options.activeOnly ? NoticeState.ACTIVE : query.state;
    const itemConditions = state
      ? [...conditions, stateFilter(state, today)]
      : conditions;

    const [docs, counts] = await Promise.all([
      this.noticeModel
        .find(itemConditions.length ? { $and: itemConditions } : {})
        .sort({ publishDate: -1, createdAt: -1 })
        .lean<LeanNotice[]>()
        .exec(),
      this.countByState(today, options.activeOnly ?? false),
    ]);

    return { items: docs.map((d) => this.toView(d, today)), counts };
  }

  async findById(id: string, options: NoticeFindOptions = {}): Promise<NoticeView> {
    const doc = await this.noticeModel.findOne({ id }).lean<LeanNotice>().exec();
    const today = todayISO();
    const state = doc ? computeNoticeState(doc, today) : undefined;
    if (
      !doc ||
      (options.activeOnly && state !== NoticeState.ACTIVE)
    ) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }
    return this.toView(doc, today);
  }

  async create(dto: CreateNoticeDto): Promise<NoticeView> {
    const today = todayISO();
    this.validateDates(dto.publishDate, dto.expiryDate);
    if (dto.publishDate < today) {
      throw new BadRequestException('Publish date cannot be in the past');
    }
    const targets = this.resolveTargets(dto.allBatches, dto.batches);

    const id = await this.generateNextNoticeId();
    const created = await this.noticeModel.create({
      id,
      title: dto.title,
      description: dto.description,
      ...targets,
      publishDate: dto.publishDate,
      expiryDate: dto.expiryDate,
      priority: dto.priority ?? NoticePriority.MEDIUM,
      status: dto.status ?? NoticeStatus.PUBLISHED,
    });

    return this.toView(created.toObject() as LeanNotice, today);
  }

  async update(id: string, dto: UpdateNoticeDto): Promise<NoticeView> {
    const existing = await this.noticeModel.findOne({ id }).exec();
    if (!existing) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }

    const today = todayISO();
    const publishDate = dto.publishDate ?? existing.publishDate;
    const expiryDate = dto.expiryDate ?? existing.expiryDate;
    this.validateDates(publishDate, expiryDate);
    // An already-past publish date may be kept, but not moved to another past date.
    if (dto.publishDate !== undefined && dto.publishDate !== existing.publishDate && dto.publishDate < today) {
      throw new BadRequestException('Publish date cannot be in the past');
    }
    if (dto.expiryDate !== undefined && dto.expiryDate !== existing.expiryDate && dto.expiryDate < today) {
      throw new BadRequestException('Expiry date cannot be in the past');
    }

    if (dto.allBatches !== undefined || dto.batches !== undefined) {
      const currentAll =
        existing.allBatches === true || (existing.batches?.length ?? 0) === 0;
      const targets = this.resolveTargets(
        dto.allBatches ?? (dto.batches !== undefined ? false : currentAll),
        dto.batches ?? existing.batches,
      );
      existing.allBatches = targets.allBatches;
      existing.batches = targets.batches;
    }

    if (dto.title !== undefined) existing.title = dto.title;
    if (dto.description !== undefined) existing.description = dto.description;
    if (dto.priority !== undefined) existing.priority = dto.priority;
    if (dto.status !== undefined) existing.status = dto.status;
    existing.publishDate = publishDate;
    existing.expiryDate = expiryDate;

    const saved = await existing.save();
    return this.toView(saved.toObject() as LeanNotice, today);
  }

  async delete(id: string): Promise<{ deleted: true; id: string }> {
    const res = await this.noticeModel.deleteOne({ id }).exec();
    if (res.deletedCount === 0) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }
    return { deleted: true, id };
  }

  private async countByState(today: string, activeOnly: boolean): Promise<NoticeCounts> {
    const states = VISIBLE_STATES;
    const [all, ...perState] = await Promise.all([
      activeOnly
        ? Promise.resolve(0)
        : this.noticeModel.countDocuments({}).exec(),
      ...states.map((s) =>
        activeOnly && s !== NoticeState.ACTIVE
          ? Promise.resolve(0)
          : this.noticeModel.countDocuments(stateFilter(s, today)).exec(),
      ),
    ]);

    const counts = { all } as NoticeCounts;
    states.forEach((s, i) => {
      counts[s] = perState[i];
    });
    if (activeOnly) counts.all = counts[NoticeState.ACTIVE];
    return counts;
  }

  private resolveTargets(
    allBatches: boolean | undefined,
    batches: string[] | undefined,
  ): { allBatches: boolean; batches: string[] } {
    if (allBatches) return { allBatches: true, batches: [] };

    const list = [...new Set((batches ?? []).filter(Boolean))];
    if (list.length === 0) {
      throw new BadRequestException(
        'Select at least one batch, or choose "All batches"',
      );
    }
    return { allBatches: false, batches: list };
  }

  private validateDates(publishDate: string, expiryDate: string): void {
    if (!isRealDate(publishDate)) {
      throw new BadRequestException('Publish date is not a valid calendar date');
    }
    if (!isRealDate(expiryDate)) {
      throw new BadRequestException('Expiry date is not a valid calendar date');
    }
    if (expiryDate < publishDate) {
      throw new BadRequestException(
        'Expiry date must be on or after the publish date',
      );
    }
  }

  private async generateNextNoticeId(): Promise<string> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { _id: NOTICE_COUNTER_KEY },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' },
      )
      .lean()
      .exec();

    const seq = counter?.seq ?? 1;
    return `NTC-${String(seq).padStart(3, '0')}`;
  }

  private toView(doc: LeanNotice, today: string): NoticeView {
    const batches = doc.batches ?? [];
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description ?? '',
      allBatches: doc.allBatches === true || batches.length === 0,
      batches,
      publishDate: doc.publishDate,
      expiryDate: doc.expiryDate,
      priority: doc.priority,
      status: doc.status,
      state: computeNoticeState(doc, today),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
