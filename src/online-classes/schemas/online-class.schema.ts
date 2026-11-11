import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';
import { ClassStatus } from '../../enums/status.enum.js';

export type OnlineClassDocument = HydratedDocument<OnlineClass>;

@Schema({
  timestamps: true,
  collection: 'online_classes',
  autoCreate: false,
  autoIndex: false,
})
export class OnlineClass {
  @Prop({ required: true, unique: true, index: true, trim: true })
  id: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, index: true })
  moduleId: string;

  @Prop({ required: true, index: true })
  teacherId: string;

  @Prop({ required: true, trim: true })
  batch: string;

  @Prop({ required: true, index: true })
  start: string;

  @Prop({ required: true })
  end: string;

  @Prop({ required: true, trim: true })
  link: string;

  @Prop({ default: '', trim: true })
  description: string;

  @Prop({
    type: String,
    enum: Object.values(ClassStatus),
    default: ClassStatus.SCHEDULED,
  })
  status: ClassStatus;
}

export const OnlineClassSchema = SchemaFactory.createForClass(OnlineClass);
