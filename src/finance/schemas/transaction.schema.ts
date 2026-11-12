import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { TxType } from '../../enums/status.enum.js';

export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({
  timestamps: true,
  collection: 'transactions',
  autoCreate: false,
  autoIndex: false,
})
export class Transaction {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ type: String, enum: Object.values(TxType), required: true })
  type: TxType;

  @Prop({ required: true, trim: true })
  category: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ type: String, default: undefined, index: true })
  studentId?: string;

  @Prop({ type: String, default: undefined })
  method?: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
