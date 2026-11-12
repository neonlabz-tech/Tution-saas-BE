import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type StudentDocument = HydratedDocument<Student>;

@Schema({
  timestamps: true,
  collection: 'students',
  autoCreate: false,
  autoIndex: false,
})
export class Student {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, unique: true, trim: true })
  ref: string;

  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ required: true })
  dob: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, trim: true })
  guardianName: string;

  @Prop({ required: true, trim: true })
  guardianPhone: string;

  @Prop({ required: true, trim: true })
  batch: string;

  @Prop({ type: [String], default: [], index: true })
  moduleIds: string[];

  @Prop({ required: true })
  enrollmentDate: string;

  @Prop({
    type: String,
    enum: ['active', 'inactive', 'graduated'],
    default: 'active',
  })
  status: 'active' | 'inactive' | 'graduated';
}

export const StudentSchema = SchemaFactory.createForClass(Student);
