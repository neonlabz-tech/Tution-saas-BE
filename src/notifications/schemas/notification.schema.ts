import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export type NotificationType =
  | 'notice'
  | 'class'
  | 'payment'
  | 'student'
  | 'system';

@Schema({
  timestamps: true,
  collection: 'notifications',
  autoCreate: false,
  autoIndex: false,
})
export class Notification {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({
    type: String,
    enum: ['notice', 'class', 'payment', 'student', 'system'],
    default: 'system',
  })
  type: NotificationType;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ default: '', trim: true })
  subtitle: string;

  @Prop({ default: false })
  read: boolean;

  @Prop({ default: false })
  isReceipt: boolean;

  @Prop({ default: '/dashboard/notices', trim: true })
  link: string;

  @Prop({ type: String, default: null, index: true })
  recipientId: string | null;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
