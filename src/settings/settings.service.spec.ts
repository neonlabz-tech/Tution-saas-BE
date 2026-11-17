import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
import { Role } from '../enums/role.enum.js';
import { User } from '../users/schemas/user.schema.js';
import { Settings } from './schemas/settings.schema.js';
import { SettingsService } from './settings.service.js';

function mockQuery<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('SettingsService', () => {
  let service: SettingsService;
  let settingsModel: Record<string, ReturnType<typeof vi.fn>>;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;

  const defaultSettings: Settings = {
    key: 'default',
    institute: {
      name: 'Bright Future Institute',
      email: 'hello@brightfuture.lk',
      phone: '0112345678',
      address: '42, Temple Road, Colombo 07',
      about: 'Modern tuition institute',
      logo: null,
    },
    appearance: {
      mode: 'light',
      accent: 'indigo',
    },
    notifications: {
      payments: true,
      overdue: true,
      absence: false,
      classes: true,
      notices: false,
    },
    channels: {
      email: true,
      push: true,
      sms: false,
    },
  };

  beforeEach(async () => {
    settingsModel = {
      findOne: vi.fn(),
      create: vi.fn(),
      findOneAndUpdate: vi.fn(),
    };
    userModel = {
      findOne: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: getModelToken(Settings.name), useValue: settingsModel },
        { provide: getModelToken(User.name), useValue: userModel },
        {
          provide: ConfigService,
          useValue: { get: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('returns settings and profile for authenticated user', async () => {
    settingsModel.findOne.mockReturnValue(mockQuery(defaultSettings));
    userModel.findOne.mockReturnValue(
      mockQuery({
        id: 'USR-001',
        fullName: 'Admin',
        email: 'admin@gmail.com',
        role: Role.ADMIN,
      }),
    );

    const res = await service.getSettings('USR-001');

    expect(res.institute.name).toBe('Bright Future Institute');
    expect(res.profile.email).toBe('admin@gmail.com');
  });

  it('throws NotFoundException when authenticated user does not exist', async () => {
    settingsModel.findOne.mockReturnValue(mockQuery(defaultSettings));
    userModel.findOne.mockReturnValue(mockQuery(null));

    await expect(service.getSettings('USR-999')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('updates institute profile fields', async () => {
    const updatedInstitute = {
      ...defaultSettings.institute,
      name: 'Neon Academy',
    };
    settingsModel.findOne.mockReturnValue(mockQuery(defaultSettings));
    settingsModel.findOneAndUpdate.mockReturnValue(
      mockQuery({ ...defaultSettings, institute: updatedInstitute }),
    );

    const res = await service.updateInstitute({ name: '  Neon Academy  ' });

    expect(settingsModel.findOneAndUpdate).toHaveBeenCalledWith(
      { key: 'default' },
      { $set: { 'institute.name': 'Neon Academy' } },
      { new: true },
    );
    expect(res.name).toBe('Neon Academy');
  });

  it('updates appearance and notification preferences', async () => {
    settingsModel.findOne.mockReturnValue(mockQuery(defaultSettings));
    settingsModel.findOneAndUpdate.mockReturnValueOnce(
      mockQuery({
        ...defaultSettings,
        appearance: { mode: 'dark', accent: 'teal' },
      }),
    );

    const appRes = await service.updateAppearance({
      mode: 'dark',
      accent: 'teal',
    });
    expect(appRes).toEqual({ mode: 'dark', accent: 'teal' });

    settingsModel.findOneAndUpdate.mockReturnValueOnce(
      mockQuery({
        ...defaultSettings,
        notifications: { ...defaultSettings.notifications, absence: true },
        channels: { ...defaultSettings.channels, sms: true },
      }),
    );
    const notifRes = await service.updateNotifications({
      notifications: { absence: true },
      channels: { sms: true },
    });
    expect(notifRes.notifications.absence).toBe(true);
    expect(notifRes.channels.sms).toBe(true);
  });

  describe('updateProfile', () => {
    it('updates name, email, and password hash when valid', async () => {
      const userDoc = {
        id: 'USR-001',
        fullName: 'Admin',
        email: 'admin@gmail.com',
        role: Role.ADMIN,
        passwordHash: 'old-hash',
        save: vi.fn().mockResolvedValue(undefined),
      };
      userModel.findOne
        .mockReturnValueOnce(mockQuery(userDoc))
        .mockReturnValueOnce(mockQuery(null));

      const res = await service.updateProfile('USR-001', {
        fullName: 'Amara Perera',
        email: 'Amara@brightfuture.lk',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123',
      });

      expect(userDoc.save).toHaveBeenCalled();
      expect(res.fullName).toBe('Amara Perera');
      expect(res.email).toBe('amara@brightfuture.lk');
      expect(
        await bcrypt.compare('NewPassword@123', userDoc.passwordHash),
      ).toBe(true);
    });

    it('throws BadRequestException when newPassword and confirmPassword differ', async () => {
      userModel.findOne.mockReturnValueOnce(
        mockQuery({
          id: 'USR-001',
          email: 'admin@gmail.com',
          save: vi.fn(),
        }),
      );

      await expect(
        service.updateProfile('USR-001', {
          newPassword: 'NewPassword@123',
          confirmPassword: 'Mismatch@123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when email belongs to another user', async () => {
      userModel.findOne
        .mockReturnValueOnce(
          mockQuery({
            id: 'USR-001',
            email: 'admin@gmail.com',
            save: vi.fn(),
          }),
        )
        .mockReturnValueOnce(mockQuery({ id: 'USR-002' }));

      await expect(
        service.updateProfile('USR-001', {
          email: 'taken@gmail.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
