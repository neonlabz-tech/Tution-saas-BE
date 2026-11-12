import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type CourseModuleDocument = HydratedDocument<CourseModule>;

@Schema({ timestamps: true, collection: 'modules' })
export class CourseModule {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, default: '' })
  description?: string;

  @Prop({ type: Number, required: true, min: 0 })
  fee!: number;

  @Prop({ type: String, default: '' })
  duration?: string;

  @Prop({ type: [String], default: [] })
  batches?: string[];

  @Prop({ type: String, default: null })
  teacherId?: string | null;

  @Prop({
    type: String,
    required: true,
    enum: ['active', 'inactive', 'upcoming'],
    default: 'active',
  })
  status!: 'active' | 'inactive' | 'upcoming';
}

export const CourseModuleSchema = SchemaFactory.createForClass(CourseModule);
