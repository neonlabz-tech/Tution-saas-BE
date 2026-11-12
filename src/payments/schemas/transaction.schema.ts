import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TransactionType = 'income' | 'expense';
export type TransactionDocument = HydratedDocument<Transaction>;

@Schema({ timestamps: true, collection: 'transactions' })
export class Transaction {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ type: String, required: true, enum: ['income', 'expense'], index: true })
  type!: TransactionType;

  @Prop({ type: String, required: true, trim: true, index: true })
  category!: string;

  @Prop({ type: Number, required: true, min: 0 })
  amount!: number;

  @Prop({ type: String, required: true, index: true })
  date!: string;

  @Prop({ type: String, default: '' })
  description?: string;

  @Prop({ type: String, index: true })
  studentId?: string;

  @Prop({ type: String })
  method?: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
