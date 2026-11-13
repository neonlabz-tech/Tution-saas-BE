import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import type { Model } from 'mongoose';
import { getAuthConfig } from '../config/auth.config.js';
import type { Role } from '../enums/role.enum.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { UpdateAppearanceDto } from './dto/update-appearance.dto.js';
import { UpdateInstituteDto } from './dto/update-institute.dto.js';
import { UpdateNotificationsDto } from './dto/update-notifications.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  type AppearanceSettings,
  type InstituteSettings,
  type NotificationChannels,
  type NotificationToggles,
  Settings,
  type SettingsDocument,
} from './schemas/settings.schema.js';

export interface ProfileSettingsView {
  id: string;
  fullName: string;
  email: string;
  role: Role;
}

export interface SettingsResponse {
  institute: InstituteSettings;
  appearance: AppearanceSettings;
  notifications: NotificationToggles;
  channels: NotificationChannels;
  profile: ProfileSettingsView;
}

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name)
    private readonly settingsModel: Model<SettingsDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @Inject(ConfigService)
    private readonly configService: ConfigService,
  ) {}

  async getSettings(userId: string): Promise<SettingsResponse> {
    const [settings, user] = await Promise.all([
      this.getOrCreateSettings(),
      this.userModel.findOne({ id: userId }).lean<User>().exec(),
    ]);

    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    return {
      institute: settings.institute,
      appearance: settings.appearance,
      notifications: settings.notifications,
      channels: settings.channels,
      profile: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    };
  }

  async updateInstitute(dto: UpdateInstituteDto): Promise<InstituteSettings> {
    await this.getOrCreateSettings();

    const setPayload: Record<string, unknown> = {};
    if (dto.name !== undefined) setPayload['institute.name'] = dto.name.trim();
    if (dto.email !== undefined)
      setPayload['institute.email'] = dto.email.trim().toLowerCase();
    if (dto.phone !== undefined)
      setPayload['institute.phone'] = dto.phone.trim();
    if (dto.address !== undefined)
      setPayload['institute.address'] = dto.address.trim();
    if (dto.about !== undefined)
      setPayload['institute.about'] = dto.about.trim();
    if (dto.logo !== undefined) setPayload['institute.logo'] = dto.logo;

    const updated = await this.settingsModel
      .findOneAndUpdate(
        { key: 'default' },
        ...(Object.keys(setPayload).length > 0 ? [{ $set: setPayload }] : [{}]),
        { new: true },
      )
      .lean<Settings>()
      .exec();

    if (!updated) {
      throw new NotFoundException('Settings document not found');
    }
    return updated.institute;
  }

  async updateAppearance(
    dto: UpdateAppearanceDto,
  ): Promise<AppearanceSettings> {
    await this.getOrCreateSettings();

    const setPayload: Record<string, unknown> = {};
    if (dto.mode !== undefined) setPayload['appearance.mode'] = dto.mode;
    if (dto.accent !== undefined) setPayload['appearance.accent'] = dto.accent;

    const updated = await this.settingsModel
      .findOneAndUpdate(
        { key: 'default' },
        ...(Object.keys(setPayload).length > 0 ? [{ $set: setPayload }] : [{}]),
        { new: true },
      )
      .lean<Settings>()
      .exec();

    if (!updated) {
      throw new NotFoundException('Settings document not found');
    }
    return updated.appearance;
  }

  async updateNotifications(dto: UpdateNotificationsDto): Promise<{
    notifications: NotificationToggles;
    channels: NotificationChannels;
  }> {
    await this.getOrCreateSettings();

    const setPayload: Record<string, unknown> = {};
    if (dto.notifications) {
      for (const [k, v] of Object.entries(dto.notifications)) {
        if (v !== undefined) setPayload[`notifications.${k}`] = v;
      }
    }
    if (dto.channels) {
      for (const [k, v] of Object.entries(dto.channels)) {
        if (v !== undefined) setPayload[`channels.${k}`] = v;
      }
    }

    const updated = await this.settingsModel
      .findOneAndUpdate(
        { key: 'default' },
        ...(Object.keys(setPayload).length > 0 ? [{ $set: setPayload }] : [{}]),
        { new: true },
      )
      .lean<Settings>()
      .exec();

    if (!updated) {
      throw new NotFoundException('Settings document not found');
    }
    return {
      notifications: updated.notifications,
      channels: updated.channels,
    };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileSettingsView> {
    const user = await this.userModel
      .findOne({ id: userId })
      .select('+passwordHash')
      .exec();

    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      if (normalizedEmail !== user.email) {
        const existingOwner = await this.userModel
          .findOne({ email: normalizedEmail, id: { $ne: userId } })
          .lean<User>()
          .exec();
        if (existingOwner) {
          throw new ConflictException(
            `An account with email "${normalizedEmail}" already exists`,
          );
        }
        user.email = normalizedEmail;
      }
    }

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName.trim();
    }

    if (dto.newPassword !== undefined) {
      if (dto.newPassword !== dto.confirmPassword) {
        throw new BadRequestException(
          'New password and confirm password do not match',
        );
      }
      const cfg = getAuthConfig(this.configService);
      user.passwordHash = await bcrypt.hash(
        dto.newPassword,
        cfg.bcryptSaltRounds,
      );
    }

    await user.save();

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }

  private async getOrCreateSettings(): Promise<Settings> {
    const existing = await this.settingsModel
      .findOne({ key: 'default' })
      .lean<Settings>()
      .exec();
    if (existing) return existing;

    const created = await this.settingsModel.create({ key: 'default' });
    return typeof created.toObject === 'function'
      ? (created.toObject() as Settings)
      : (created as unknown as Settings);
  }
}
