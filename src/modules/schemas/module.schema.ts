import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { ModuleStatus } from '../../enums/status.enum.js';

export type CourseModuleDocument = HydratedDocument<CourseModule>;

@Schema({
  timestamps: true,
  collection: 'modules',
  autoCreate: false,
  autoIndex: false,
})
export class CourseModule {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, unique: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({ required: true, min: 0 })
  fee: number;

  @Prop({ required: true, trim: true })
  duration: string;

  @Prop({ type: String, default: null, index: true })
  teacherId: string | null;

  @Prop({ type: [String], default: [] })
  batches: string[];

  @Prop({
    type: String,
    enum: Object.values(ModuleStatus),
    default: ModuleStatus.ACTIVE,
  })
  status: ModuleStatus;
}

export const CourseModuleSchema = SchemaFactory.createForClass(CourseModule);
