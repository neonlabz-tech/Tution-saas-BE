import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type BatchDocument = HydratedDocument<Batch>;

@Schema({
  timestamps: true,
  collection: 'batches',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})
export class Batch {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id!: string;

  @Prop({ required: true, unique: true, trim: true })
  name!: string;

  @Prop({ type: String, default: '', trim: true })
  code?: string;

  @Prop({ type: String, default: '', trim: true })
  year?: string;

  @Prop({ type: String, default: '', trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ['active', 'upcoming', 'archived'],
    default: 'active',
  })
  status!: string;

  @Prop({
    type: String,
    enum: ['al', 'grade'],
    default: 'al',
  })
  category?: 'al' | 'grade';
}

export const BatchSchema = SchemaFactory.createForClass(Batch);
