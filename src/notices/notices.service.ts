import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import {
  CreateNoticeDto,
  HH_MM_REGEX,
  ISO_DATE_REGEX,
} from './dto/create-notice.dto.js';
import { QueryNoticeDto } from './dto/query-notice.dto.js';
import { UpdateNoticeDto } from './dto/update-notice.dto.js';
import { R2StorageService } from './r2-storage.service.js';
import {
  Notice,
  type NoticeAttachment,
  type NoticeDocument,
} from './schemas/notice.schema.js';

export interface NoticeView {
  id: string;
  title: string;
  description: string;
  allBatches: boolean;
  batches: string[];
  publishDate: string;
  expiryDate: string;
  expiryTime: string;
  expiresAt: Date;
  attachment: NoticeAttachment | null;
  attachmentExpired: boolean;
  priority: NoticePriority;
  status: NoticeStatus;
  state: NoticeState;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UploadedNoticeFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface AttachmentDownloadResult {
  url: string;
  fileName: string;
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

export function computeExpiresAt(
  expiryDate: string,
  expiryTime = '23:59',
): Date {
  const [y, m, d] = expiryDate.split('-').map(Number);
  const [hh, mm] = expiryTime.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh ?? 23, mm ?? 59, 0, 0);
}

export function resolveEffectiveExpiresAt(
  n: Pick<Notice, 'expiryDate' | 'expiryTime' | 'expiresAt'>,
): Date {
  if (n.expiresAt) return new Date(n.expiresAt);
  return computeExpiresAt(n.expiryDate, n.expiryTime ?? '23:59');
}

export function computeNoticeState(
  n: Pick<Notice, 'status' | 'publishDate' | 'expiryDate' | 'expiryTime' | 'expiresAt'>,
  nowOrToday: Date | string = new Date(),
): NoticeState {
  if (n.status === NoticeStatus.DRAFT) return NoticeState.DRAFT;

  const isDateArg = nowOrToday instanceof Date;
  const today = isDateArg ? todayISO(nowOrToday) : nowOrToday;
  if (n.publishDate > today) return NoticeState.SCHEDULED;

  if (isDateArg) {
    if (nowOrToday.getTime() >= resolveEffectiveExpiresAt(n).getTime()) {
      return NoticeState.EXPIRED;
    }
    return NoticeState.ACTIVE;
  }

  if (n.expiresAt) {
    const refNow = new Date(`${nowOrToday}T12:00:00`);
    if (refNow.getTime() >= new Date(n.expiresAt).getTime()) {
      return NoticeState.EXPIRED;
    }
    return NoticeState.ACTIVE;
  }

  if (n.expiryDate < today) return NoticeState.EXPIRED;
  return NoticeState.ACTIVE;
}

function stateFilter(
  state: VisibleNoticeState,
  now: Date,
  today: string,
): QueryFilter<Notice> {
  switch (state) {
    case NoticeState.DRAFT:
      return { status: NoticeStatus.DRAFT };
    case NoticeState.SCHEDULED:
      return { status: NoticeStatus.PUBLISHED, publishDate: { $gt: today } };
    case NoticeState.ACTIVE:
      return {
        status: NoticeStatus.PUBLISHED,
        publishDate: { $lte: today },
        $or: [
          { expiresAt: { $gt: now } },
          { expiresAt: { $exists: false }, expiryDate: { $gte: today } },
          { expiresAt: null, expiryDate: { $gte: today } },
        ],
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
    private readonly r2Storage: R2StorageService,
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
    const now = new Date();
    const today = todayISO(now);
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
      ? [...conditions, stateFilter(state, now, today)]
      : conditions;

    const [docs, counts] = await Promise.all([
      this.noticeModel
        .find(itemConditions.length ? { $and: itemConditions } : {})
        .sort({ publishDate: -1, createdAt: -1 })
        .lean<LeanNotice[]>()
        .exec(),
      this.countByState(now, today, options.activeOnly ?? false),
    ]);

    return { items: docs.map((d) => this.toView(d, now)), counts };
  }

  async findById(id: string, options: NoticeFindOptions = {}): Promise<NoticeView> {
    const doc = await this.noticeModel.findOne({ id }).lean<LeanNotice>().exec();
    const now = new Date();
    const state = doc ? computeNoticeState(doc, now) : undefined;
    if (
      !doc ||
      (options.activeOnly && state !== NoticeState.ACTIVE)
    ) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }
    return this.toView(doc, now);
  }

  async create(dto: CreateNoticeDto): Promise<NoticeView> {
    const now = new Date();
    const today = todayISO(now);
    this.validateDates(dto.publishDate, dto.expiryDate);
    if (dto.publishDate < today) {
      throw new BadRequestException('Publish date cannot be in the past');
    }
    const expiryTime = this.normalizeExpiryTime(dto.expiryTime);
    const expiresAt = this.resolveExpiresAtInput(
      dto.expiryDate,
      expiryTime,
      dto.expiresAt,
    );
    const targets = this.resolveTargets(dto.allBatches, dto.batches);

    const id = await this.generateNextNoticeId();
    const created = await this.noticeModel.create({
      id,
      title: dto.title,
      description: dto.description,
      ...targets,
      publishDate: dto.publishDate,
      expiryDate: dto.expiryDate,
      expiryTime,
      expiresAt,
      attachment: null,
      attachmentExpired: false,
      priority: dto.priority ?? NoticePriority.MEDIUM,
      status: dto.status ?? NoticeStatus.PUBLISHED,
    });

    return this.toView(created.toObject() as LeanNotice, now);
  }

  async update(id: string, dto: UpdateNoticeDto): Promise<NoticeView> {
    const existing = await this.noticeModel.findOne({ id }).exec();
    if (!existing) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }

    const now = new Date();
    const today = todayISO(now);
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

    const expiryTime = this.normalizeExpiryTime(
      dto.expiryTime ?? existing.expiryTime,
    );
    const shouldRecomputeExpiresAt =
      dto.expiresAt !== undefined ||
      dto.expiryDate !== undefined ||
      dto.expiryTime !== undefined ||
      !existing.expiresAt;
    const expiresAt = shouldRecomputeExpiresAt
      ? this.resolveExpiresAtInput(expiryDate, expiryTime, dto.expiresAt)
      : existing.expiresAt;

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
    existing.expiryTime = expiryTime;
    existing.expiresAt = expiresAt;

    const saved = await existing.save();
    return this.toView(saved.toObject() as LeanNotice, now);
  }

  async delete(id: string): Promise<{ deleted: true; id: string }> {
    const existing = await this.noticeModel.findOne({ id }).lean<LeanNotice>().exec();
    if (!existing) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }
    if (existing.attachment?.key) {
      await this.r2Storage.deleteObject(existing.attachment.key);
    }
    await this.noticeModel.deleteOne({ id }).exec();
    return { deleted: true, id };
  }

  async uploadAttachment(
    id: string,
    file: UploadedNoticeFile,
  ): Promise<NoticeView> {
    const existing = await this.noticeModel.findOne({ id }).exec();
    if (!existing) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }

    const now = new Date();
    const effectiveExpiresAt = resolveEffectiveExpiresAt(existing);
    if (now.getTime() >= effectiveExpiresAt.getTime()) {
      throw new BadRequestException(
        'Cannot upload an attachment to an expired notice',
      );
    }

    if (existing.attachment?.key) {
      await this.r2Storage.deleteObject(existing.attachment.key);
    }

    const sanitizedName =
      file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_') || 'attachment';
    const key = `notices/${existing.id}/${randomUUID()}-${sanitizedName}`;

    await this.r2Storage.uploadObject(key, file.buffer, file.mimetype);

    existing.attachment = {
      key,
      fileName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: now,
    };
    existing.attachmentExpired = false;

    const saved = await existing.save();
    return this.toView(saved.toObject() as LeanNotice, now);
  }

  async getAttachmentDownload(
    id: string,
    options: NoticeFindOptions = {},
  ): Promise<AttachmentDownloadResult> {
    const existing = await this.noticeModel.findOne({ id }).exec();
    const now = new Date();
    const today = todayISO(now);

    if (
      !existing ||
      (options.activeOnly &&
        (existing.status !== NoticeStatus.PUBLISHED ||
          existing.publishDate > today))
    ) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }

    if (!existing.attachment) {
      if (existing.attachmentExpired) {
        throw new GoneException(
          'This document has expired and is no longer available',
        );
      }
      throw new NotFoundException(
        `Notice "${id}" does not have an attachment`,
      );
    }

    const effectiveExpiresAt = resolveEffectiveExpiresAt(existing);
    if (now.getTime() >= effectiveExpiresAt.getTime()) {
      await this.r2Storage.deleteObject(existing.attachment.key);
      existing.attachment = null;
      existing.attachmentExpired = true;
      await existing.save();
      throw new GoneException(
        'This document has expired and is no longer available',
      );
    }

    const url = await this.r2Storage.getPresignedDownloadUrl(
      existing.attachment.key,
      existing.attachment.fileName,
      60,
    );

    return {
      url,
      fileName: existing.attachment.fileName,
    };
  }

  async deleteAttachment(id: string): Promise<NoticeView> {
    const existing = await this.noticeModel.findOne({ id }).exec();
    if (!existing) {
      throw new NotFoundException(`Notice with ID "${id}" not found`);
    }

    if (existing.attachment?.key) {
      await this.r2Storage.deleteObject(existing.attachment.key);
    }

    existing.attachment = null;
    existing.attachmentExpired = false;
    const saved = await existing.save();
    return this.toView(saved.toObject() as LeanNotice, new Date());
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredAttachments(): Promise<number> {
    const now = new Date();
    const expired = await this.noticeModel
      .find({
        expiresAt: { $lte: now },
        attachment: { $ne: null },
      })
      .select('id attachment')
      .lean<Array<{ _id: Types.ObjectId; id: string; attachment?: NoticeAttachment | null }>>()
      .exec();

    let cleaned = 0;
    for (const doc of expired) {
      if (!doc.attachment?.key) continue;
      try {
        await this.r2Storage.deleteObject(doc.attachment.key);
        await this.noticeModel
          .updateOne(
            { _id: doc._id },
            { $set: { attachment: null, attachmentExpired: true } },
          )
          .exec();
        cleaned += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to clean expired attachment for notice ${doc.id}: ${String(err)}`,
        );
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned ${cleaned} expired notice attachment(s) from R2`);
    }
    return cleaned;
  }

  private async countByState(
    now: Date,
    today: string,
    activeOnly: boolean,
  ): Promise<NoticeCounts> {
    const states = VISIBLE_STATES;
    const [all, ...perState] = await Promise.all([
      activeOnly
        ? Promise.resolve(0)
        : this.noticeModel.countDocuments({}).exec(),
      ...states.map((s) =>
        activeOnly && s !== NoticeState.ACTIVE
          ? Promise.resolve(0)
          : this.noticeModel.countDocuments(stateFilter(s, now, today)).exec(),
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

  private normalizeExpiryTime(expiryTime?: string): string {
    if (!expiryTime) return '23:59';
    if (!HH_MM_REGEX.test(expiryTime)) {
      throw new BadRequestException(
        'Expiry time must be in HH:mm format (00:00 - 23:59)',
      );
    }
    return expiryTime;
  }

  private resolveExpiresAtInput(
    expiryDate: string,
    expiryTime: string,
    explicitExpiresAt?: string,
  ): Date {
    if (!explicitExpiresAt) {
      return computeExpiresAt(expiryDate, expiryTime);
    }
    const parsed = new Date(explicitExpiresAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('expiresAt must be a valid ISO-8601 timestamp');
    }
    return parsed;
  }

  private toView(doc: LeanNotice, now: Date): NoticeView {
    const batches = doc.batches ?? [];
    const expiryTime = doc.expiryTime ?? '23:59';
    return {
      id: doc.id,
      title: doc.title,
      description: doc.description ?? '',
      allBatches: doc.allBatches === true || batches.length === 0,
      batches,
      publishDate: doc.publishDate,
      expiryDate: doc.expiryDate,
      expiryTime,
      expiresAt: resolveEffectiveExpiresAt(doc),
      attachment: doc.attachment ?? null,
      attachmentExpired: doc.attachmentExpired ?? false,
      priority: doc.priority,
      status: doc.status,
      state: computeNoticeState(doc, now),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
