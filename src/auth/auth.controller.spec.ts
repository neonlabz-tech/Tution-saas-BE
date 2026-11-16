import { Test, type TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { Role } from '../enums/role.enum.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let service: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    service = {
      getLoginConfig: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      getProfile: vi.fn(),
      logout: vi.fn(),
      changePassword: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('returns login config', () => {
    const cfg = { authEnabled: true };
    service.getLoginConfig.mockReturnValue(cfg);

    expect(controller.getLoginConfig()).toBe(cfg);
    expect(service.getLoginConfig).toHaveBeenCalled();
  });

  it('delegates login and register and sets auth cookie', async () => {
    const authRes = { accessToken: 'tok', expiresIn: '7d' };
    const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Parameters<
      AuthController['login']
    >[1];
    service.login.mockResolvedValue(authRes);
    service.register.mockResolvedValue(authRes);

    expect(
      await controller.login({ email: 'a@b.com', password: 'secret12' }, res),
    ).toBe(authRes);
    expect(
      await controller.register(
        {
          fullName: 'Amara',
          email: 'a@b.com',
          password: 'secret12',
        },
        res,
      ),
    ).toBe(authRes);
    expect(res.cookie).toHaveBeenCalledTimes(2);
  });

  it('delegates getMe, logout, and changePassword', async () => {
    const user = {
      sub: 'USR-001',
      email: 'amara@brightfuture.lk',
      fullName: 'Amara Perera',
      role: Role.ADMIN,
    };
    const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Parameters<
      AuthController['logout']
    >[0];
    service.getProfile.mockResolvedValue({ id: 'USR-001' });
    service.logout.mockReturnValue({ loggedOut: true });
    service.changePassword.mockResolvedValue({ updated: true });

    expect(await controller.getMe(user)).toEqual({ id: 'USR-001' });
    expect(controller.logout(res)).toEqual({ loggedOut: true });
    expect(res.clearCookie).toHaveBeenCalledTimes(1);
    expect(
      await controller.changePassword(user, {
        currentPassword: 'old',
        newPassword: 'newpassword1',
      }),
    ).toEqual({ updated: true });
  });

  it('delegates forgotPassword and resetPassword', async () => {
    service.forgotPassword.mockResolvedValue({ message: 'sent' });
    service.resetPassword.mockResolvedValue({ message: 'reset' });

    expect(
      await controller.forgotPassword({ email: 'admin@gmail.com' }),
    ).toEqual({ message: 'sent' });
    expect(service.forgotPassword).toHaveBeenCalledWith({
      email: 'admin@gmail.com',
    });

    expect(
      await controller.resetPassword({
        token: 'test-token',
        newPassword: 'newPassword123',
      }),
    ).toEqual({ message: 'reset' });
    expect(service.resetPassword).toHaveBeenCalledWith({
      token: 'test-token',
      newPassword: 'newPassword123',
    });
  });
});
