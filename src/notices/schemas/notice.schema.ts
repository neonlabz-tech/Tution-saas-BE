import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { NoticePriority, NoticeStatus } from '../../enums/status.enum.js';

export type NoticeDocument = HydratedDocument<Notice>;

@Schema({
  timestamps: true,
  collection: 'notices',
  autoCreate: false,
  autoIndex: false,
})
export class Notice {
  @Prop({ trim: true })
  id?: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ type: [String], default: [] })
  batches: string[];

  @Prop({ required: true })
  publishDate: string;

  @Prop({ required: true, index: true })
  expiryDate: string;

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
