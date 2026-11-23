import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const PAYMENT_STATUSES = ['completed', 'refunded', 'void'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentDocument = HydratedDocument<Payment>;

@Schema({
  timestamps: true,
  collection: 'payments',
  autoCreate: false,
  autoIndex: false,
})
export class Payment {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, unique: true, index: true, trim: true })
  receiptNo: string;

  @Prop({ required: true, index: true, trim: true })
  studentId: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: 0, min: 0 })
  discount: number;

  @Prop({ required: true, default: 'Tuition fees', trim: true })
  category: string;

  @Prop({ required: true, trim: true })
  method: string;

  @Prop({ required: true, index: true, trim: true })
  date: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({
    type: String,
    enum: PAYMENT_STATUSES,
    default: 'completed',
    index: true,
  })
  status: PaymentStatus;

  @Prop({ type: String, default: undefined, trim: true })
  collectedBy?: string;

  @Prop({ type: String, default: undefined, index: true, trim: true })
  transactionId?: string;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
