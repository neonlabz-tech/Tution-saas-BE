import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { NoticePriority, NoticeStatus } from '../../enums/status.enum.js';

export type NoticeDocument = HydratedDocument<Notice>;

@Schema({ _id: false })
export class NoticeAttachment {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  mimeType: string;

  @Prop({ required: true })
  size: number;

  @Prop({ type: Date, required: true })
  uploadedAt: Date;
}

export const NoticeAttachmentSchema =
  SchemaFactory.createForClass(NoticeAttachment);

@Schema({
  timestamps: true,
  collection: 'notices',
  autoCreate: false,
  autoIndex: false,
})
export class Notice {
  /** Human-readable id, e.g. NTC-001. Generated from the `counters` collection. */
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  description: string;

  /** When true the notice targets every batch and `batches` is empty. */
  @Prop({ type: Boolean, default: false, index: true })
  allBatches: boolean;

  @Prop({ type: [String], default: [], index: true })
  batches: string[];

  /** YYYY-MM-DD */
  @Prop({ required: true, index: true })
  publishDate: string;

  /** YYYY-MM-DD */
  @Prop({ required: true, index: true })
  expiryDate: string;

  /** HH:mm, defaults to 23:59 */
  @Prop({ type: String, default: '23:59' })
  expiryTime?: string;

  /** Exact ISO-8601 expiry timestamp computed from expiryDate + expiryTime */
  @Prop({ type: Date, index: true })
  expiresAt?: Date;

  @Prop({ type: NoticeAttachmentSchema, default: null })
  attachment?: NoticeAttachment | null;

  @Prop({ type: Boolean, default: false })
  attachmentExpired?: boolean;

  @Prop({
    type: String,
    enum: Object.values(NoticePriority),
    default: NoticePriority.MEDIUM,
  })
  priority: NoticePriority;

  @Prop({
    type: String,
    enum: Object.values(NoticeStatus),
    default: NoticeStatus.PUBLISHED,
  })
  status: NoticeStatus;
}

export const NoticeSchema = SchemaFactory.createForClass(Notice);
