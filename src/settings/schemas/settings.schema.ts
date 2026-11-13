import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type SettingsDocument = HydratedDocument<Settings>;

export interface InstituteSettings {
  name: string;
  email: string;
  phone: string;
  address: string;
  about: string;
  logo: string | null;
}

export interface AppearanceSettings {
  mode: 'light' | 'dark' | 'system';
  accent: 'indigo' | 'violet' | 'teal' | 'rose';
}

export interface NotificationToggles {
  payments: boolean;
  overdue: boolean;
  absence: boolean;
  classes: boolean;
  notices: boolean;
}

export interface NotificationChannels {
  email: boolean;
  push: boolean;
  sms: boolean;
}

@Schema({ timestamps: true, collection: 'settings' })
export class Settings {
  @Prop({ required: true, unique: true, default: 'default' })
  key: string;

  @Prop({
    type: {
      name: { type: String, default: 'Bright Future Institute' },
      email: { type: String, default: 'hello@brightfuture.lk' },
      phone: { type: String, default: '0112345678' },
      address: { type: String, default: '42, Temple Road, Colombo 07' },
      about: {
        type: String,
        default:
          'A modern tuition institute for GCE Advanced Level and professional courses.',
      },
      logo: { type: String, default: null },
    },
    default: () => ({
      name: 'Bright Future Institute',
      email: 'hello@brightfuture.lk',
      phone: '0112345678',
      address: '42, Temple Road, Colombo 07',
      about:
        'A modern tuition institute for GCE Advanced Level and professional courses.',
      logo: null,
    }),
  })
  institute: InstituteSettings;

  @Prop({
    type: {
      mode: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
      accent: {
        type: String,
        enum: ['indigo', 'violet', 'teal', 'rose'],
        default: 'indigo',
      },
    },
    default: () => ({ mode: 'light', accent: 'indigo' }),
  })
  appearance: AppearanceSettings;

  @Prop({
    type: {
      payments: { type: Boolean, default: true },
      overdue: { type: Boolean, default: true },
      absence: { type: Boolean, default: false },
      classes: { type: Boolean, default: true },
      notices: { type: Boolean, default: false },
    },
    default: () => ({
      payments: true,
      overdue: true,
      absence: false,
      classes: true,
      notices: false,
    }),
  })
  notifications: NotificationToggles;

  @Prop({
    type: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
    },
    default: () => ({ email: true, push: true, sms: false }),
  })
  channels: NotificationChannels;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
