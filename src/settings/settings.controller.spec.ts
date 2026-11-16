import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { Role } from '../enums/role.enum.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

describe('SettingsController', () => {
  let controller: SettingsController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  const user = {
    sub: 'USR-001',
    email: 'admin@gmail.com',
    fullName: 'Admin',
    role: Role.ADMIN,
  };

  beforeEach(async () => {
    service = {
      getSettings: vi.fn(),
      updateInstitute: vi.fn(),
      updateAppearance: vi.fn(),
      updateProfile: vi.fn(),
      updateNotifications: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SettingsController],
      providers: [{ provide: SettingsService, useValue: service }],
    }).compile();

    controller = module.get<SettingsController>(SettingsController);
  });

  it('delegates all settings endpoints to SettingsService', async () => {
    service.getSettings.mockResolvedValue({ institute: {} });
    service.updateInstitute.mockResolvedValue({ name: 'Test' });
    service.updateAppearance.mockResolvedValue({ mode: 'dark' });
    service.updateProfile.mockResolvedValue({ id: 'USR-001' });
    service.updateNotifications.mockResolvedValue({ notifications: {} });

    expect(await controller.getSettings(user)).toEqual({ institute: {} });
    expect(await controller.updateInstitute({ name: 'Test' })).toEqual({
      name: 'Test',
    });
    expect(await controller.updateAppearance({ mode: 'dark' })).toEqual({
      mode: 'dark',
    });
    expect(await controller.updateProfile(user, { fullName: 'New' })).toEqual({
      id: 'USR-001',
    });
    expect(
      await controller.updateNotifications({ channels: { sms: true } }),
    ).toEqual({ notifications: {} });
  });
});
