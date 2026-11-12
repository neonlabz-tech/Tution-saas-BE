import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { vi } from 'vitest';
import { Role } from '../enums/role.enum.js';
import { User } from '../users/schemas/user.schema.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

function mockChain<T>(result: T) {
  return {
    select: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };
  let configValues: Record<string, string>;

  beforeEach(async () => {
    configValues = {
      JWT_SECRET: 'test-secret',
      JWT_EXPIRES_IN: '7d',
      AUTH_ALLOW_REGISTRATION: 'true',
      INSTITUTE_NAME: 'Bright Future Institute',
    };

    userModel = {
      countDocuments: vi.fn(),
      findOne: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
    };
    jwtService = {
      signAsync: vi.fn().mockResolvedValue('signed-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => configValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns login configuration', () => {
    const cfg = service.getLoginConfig();

    expect(cfg).toEqual({
      authEnabled: true,
      loginMethods: ['password'],
      allowSelfRegistration: true,
      passwordMinLength: 8,
      tokenType: 'Bearer',
      tokenExpiresIn: '7d',
      instituteName: 'Bright Future Institute',
      roles: Object.values(Role),
    });
  });

  describe('login', () => {
    it('authenticates valid user and returns Bearer token', async () => {
      const passwordHash = await bcrypt.hash('Admin@123', 4);
      const userDoc = {
        id: 'USR-001',
        fullName: 'Amara Perera',
        email: 'amara@brightfuture.lk',
        passwordHash,
        role: Role.ADMIN,
        isActive: true,
        lastLoginAt: null as Date | null,
        save: vi.fn().mockResolvedValue(undefined),
      };
      userModel.findOne.mockReturnValue(mockChain(userDoc));

      const res = await service.login({
        email: 'Amara@brightfuture.lk',
        password: 'Admin@123',
      });

      expect(userDoc.save).toHaveBeenCalled();
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: 'USR-001',
        email: 'amara@brightfuture.lk',
        fullName: 'Amara Perera',
        role: Role.ADMIN,
      });
      expect(res.accessToken).toBe('signed-jwt-token');
      expect(res.user.email).toBe('amara@brightfuture.lk');
    });

    it('throws UnauthorizedException for wrong password', async () => {
      const passwordHash = await bcrypt.hash('Admin@123', 4);
      userModel.findOne.mockReturnValue(
        mockChain({
          id: 'USR-001',
          email: 'amara@brightfuture.lk',
          passwordHash,
          isActive: true,
        }),
      );

      await expect(
        service.login({ email: 'amara@brightfuture.lk', password: 'WrongPassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when account is inactive', async () => {
      userModel.findOne.mockReturnValue(
        mockChain({
          id: 'USR-001',
          email: 'amara@brightfuture.lk',
          passwordHash: 'hash',
          isActive: false,
        }),
      );

      await expect(
        service.login({ email: 'amara@brightfuture.lk', password: 'Admin@123' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('register', () => {
    it('creates user with sequential USR-XXX id and returns token', async () => {
      userModel.findOne.mockReturnValue(mockChain(null));
      userModel.find.mockReturnValue(mockChain([{ id: 'USR-001' }]));
      userModel.create.mockImplementation(async (doc) => doc);

      const res = await service.register({
        fullName: 'Kajaluxmy Kanesarasa',
        email: 'kajal@brightfuture.lk',
        password: 'Password@123',
      });

      expect(userModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'USR-002',
          email: 'kajal@brightfuture.lk',
          role: Role.ADMIN,
        }),
      );
      expect(res.accessToken).toBe('signed-jwt-token');
    });

    it('throws ConflictException on duplicate email', async () => {
      userModel.findOne.mockReturnValue(mockChain({ id: 'USR-001' }));

      await expect(
        service.register({
          fullName: 'Dup User',
          email: 'amara@brightfuture.lk',
          password: 'Password@123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ForbiddenException when self-registration is disabled', async () => {
      configValues.AUTH_ALLOW_REGISTRATION = 'false';

      await expect(
        service.register({
          fullName: 'New User',
          email: 'new@brightfuture.lk',
          password: 'Password@123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getProfile & changePassword', () => {
    it('returns profile or throws NotFoundException', async () => {
      userModel.findOne.mockReturnValueOnce(mockChain(null));
      await expect(service.getProfile('USR-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates password hash when current password matches', async () => {
      const oldHash = await bcrypt.hash('OldPass@123', 4);
      const userDoc = {
        id: 'USR-001',
        passwordHash: oldHash,
        save: vi.fn().mockResolvedValue(undefined),
      };
      userModel.findOne.mockReturnValue(mockChain(userDoc));

      const res = await service.changePassword('USR-001', {
        currentPassword: 'OldPass@123',
        newPassword: 'NewPass@123',
      });

      expect(res).toEqual({ updated: true });
      expect(userDoc.save).toHaveBeenCalled();
      expect(await bcrypt.compare('NewPass@123', userDoc.passwordHash)).toBe(
        true,
      );
    });
  });

  describe('LoginDto validation', () => {
    it('allows existing valid passwords without complexity rules', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'admin@gmil.com',
        password: '123',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('requires valid email and non-empty password', async () => {
      const dto = plainToInstance(LoginDto, {
        email: 'not-an-email',
        password: '',
      });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toEqual(['email', 'password']);
    });
  });
});
