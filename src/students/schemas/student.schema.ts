import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const STUDENT_STATUSES = [
  'pending',
  'active',
  'inactive',
  'graduated',
] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number];
export type StudentDocument = HydratedDocument<Student>;

@Schema({ timestamps: true, collection: 'students' })
export class Student {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, unique: true })
  ref!: string;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, trim: true })
  phone!: string;

  @Prop({ required: true })
  dob!: string;

  @Prop({ required: true, trim: true })
  address!: string;

  @Prop({ required: true, trim: true })
  guardianName!: string;

  @Prop({ required: true, trim: true })
  guardianPhone!: string;

  @Prop({ required: true, trim: true, index: true })
  batch!: string;

  @Prop({ type: [String], required: true, default: [], index: true })
  moduleIds!: string[];

  @Prop({ required: true })
  enrollmentDate!: string;

  @Prop({
    type: String,
    required: true,
    enum: STUDENT_STATUSES,
    default: 'pending',
    index: true,
  })
  status!: StudentStatus;

  @Prop({ type: Date })
  qrRotatedAt?: Date;
}

export const StudentSchema = SchemaFactory.createForClass(Student);
