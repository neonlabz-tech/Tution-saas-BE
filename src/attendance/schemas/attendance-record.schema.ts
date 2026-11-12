import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';
export type AttendanceMethod = 'manual' | 'qr';
export type AttendanceRecordDocument = HydratedDocument<AttendanceRecord>;

@Schema({ timestamps: true, collection: 'attendance_records' })
export class AttendanceRecord {
  @Prop({ required: true, unique: true })
  id!: string;

  @Prop({ required: true, index: true })
  studentId!: string;

  @Prop({ required: true, index: true })
  moduleId!: string;

  @Prop({ required: true, index: true })
  date!: string;

  @Prop({
    type: String,
    required: true,
    enum: ['present', 'late', 'absent', 'excused'],
  })
  status!: AttendanceStatus;

  @Prop({ type: String, enum: ['manual', 'qr'], default: 'manual' })
  method!: AttendanceMethod;
}

export const AttendanceRecordSchema =
  SchemaFactory.createForClass(AttendanceRecord);
