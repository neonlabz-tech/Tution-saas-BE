import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { AttendanceStatus } from '../../enums/status.enum.js';

export type AttendanceRecordDocument = HydratedDocument<AttendanceRecord>;

@Schema({
  timestamps: true,
  collection: 'attendance',
  autoCreate: false,
  autoIndex: false,
})
export class AttendanceRecord {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, index: true })
  studentId: string;

  @Prop({ required: true, index: true })
  moduleId: string;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({
    type: String,
    enum: Object.values(AttendanceStatus),
    required: true,
  })
  status: AttendanceStatus;

  @Prop({ type: String, enum: ['manual', 'qr'], default: 'manual' })
  method: 'manual' | 'qr';
}

export const AttendanceRecordSchema =
  SchemaFactory.createForClass(AttendanceRecord);
