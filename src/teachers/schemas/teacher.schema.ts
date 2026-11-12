import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { TeacherStatus } from '../../enums/status.enum.js';

export type TeacherDocument = HydratedDocument<Teacher>;

@Schema({ timestamps: true, collection: 'teachers' })
export class Teacher {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ default: '', trim: true })
  qualification: string;

  @Prop({ default: '', trim: true })
  specialization: string;

  @Prop({ type: [String], default: [] })
  batches: string[];

  @Prop({ type: [String], default: [] })
  moduleIds: string[];

  @Prop({ required: true })
  joiningDate: string;

  @Prop({
    type: String,
    enum: Object.values(TeacherStatus),
    default: TeacherStatus.ACTIVE,
    index: true,
  })
  status: TeacherStatus;
}

export const TeacherSchema = SchemaFactory.createForClass(Teacher);
