import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { Model } from 'mongoose';
import { getAuthConfig } from '../config/auth.config.js';
import type { AuthenticatedUser } from '../decorators/current-user.decorator.js';
import { Role } from '../enums/role.enum.js';
import {
  Notification,
  type NotificationDocument,
} from '../notifications/schemas/notification.schema.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { MailService } from './mail.service.js';

export interface LoginConfigResponse {
  authEnabled: boolean;
  loginMethods: string[];
  allowSelfRegistration: boolean;
  passwordMinLength: number;
  tokenType: 'Bearer';
  tokenExpiresIn: string;
  instituteName: string;
  roles: Role[];
}

export interface AuthUserView {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  user: AuthUserView;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(MailService) private readonly mailService: MailService,
  ) {}

  async onModuleInit(): Promise<void> {
    const cfg = getAuthConfig(this.configService);
    const email = cfg.defaultAdminEmail.trim().toLowerCase();
    if (!email || !cfg.defaultAdminPassword) return;

    const existing = await this.userModel.findOne({ email }).exec();
    const passwordHash = await bcrypt.hash(
      cfg.defaultAdminPassword,
      cfg.bcryptSaltRounds,
    );

    if (existing) {
      existing.passwordHash = passwordHash;
      existing.role = Role.ADMIN;
      existing.isActive = true;
      await existing.save();
      this.logger.log(`Synced admin account "${email}" from environment`);
      return;
    }

    const id = await this.generateNextUserId();
    await this.userModel.create({
      id,
      fullName: cfg.defaultAdminName,
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      lastLoginAt: null,
    });

    this.logger.log(`Seeded admin account "${email}" from environment`);
  }

  getLoginConfig(): LoginConfigResponse {
    const cfg = getAuthConfig(this.configService);
    return {
      authEnabled: true,
      loginMethods: ['password'],
      allowSelfRegistration: cfg.allowSelfRegistration,
      passwordMinLength: cfg.passwordMinLength,
      tokenType: 'Bearer',
      tokenExpiresIn: cfg.jwtExpiresIn,
      instituteName: cfg.instituteName,
      roles: Object.values(Role),
    };
  }

  async login(dto: LoginDto): Promise<AuthTokenResponse> {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .select('+passwordHash')
      .exec();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.buildTokenResponse(user);
  }

  async register(dto: RegisterDto): Promise<AuthTokenResponse> {
    const cfg = getAuthConfig(this.configService);
    const isStudent = dto.role === Role.STUDENT;
    if (!cfg.allowSelfRegistration && !isStudent) {
      throw new ForbiddenException('Admin self-registration is disabled');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userModel
      .findOne({ email: normalizedEmail })
      .lean<User>()
      .exec();
    if (existing) {
      throw new ConflictException(
        `An account with email "${normalizedEmail}" already exists`,
      );
    }

    const id = await this.generateNextUserId();
    const passwordHash = await bcrypt.hash(dto.password, cfg.bcryptSaltRounds);
    const created = await this.userModel.create({
      id,
      fullName: dto.fullName.trim(),
      email: normalizedEmail,
      passwordHash,
      role: dto.role ?? Role.ADMIN,
      isActive: true,
      lastLoginAt: new Date(),
    });

    if (created.role === Role.STUDENT) {
      await this.notificationModel
        .create({
          id: `notif_stu_${created.id}`,
          type: 'student',
          title: `New Student Registration: ${created.fullName}`,
          subtitle: `${created.email} registered an online student account`,
          link: '/dashboard/students',
          read: false,
          recipientId: null,
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to create student registration notification: ${err}`,
          );
        });
    }

    return this.buildTokenResponse(created);
  }

  async getProfile(userId: string): Promise<AuthUserView> {
    const user = await this.userModel
      .findOne({ id: userId })
      .lean<User>()
      .exec();
    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }
    return this.toUserView(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ updated: true }> {
    const user = await this.userModel
      .findOne({ id: userId })
      .select('+passwordHash')
      .exec();
    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const cfg = getAuthConfig(this.configService);
    user.passwordHash = await bcrypt.hash(
      dto.newPassword,
      cfg.bcryptSaltRounds,
    );
    await user.save();

    return { updated: true };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; devResetUrl?: string }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel
      .findOne({ email })
      .select('+passwordHash +resetPasswordToken +resetPasswordExpires')
      .exec();

    // For security and privacy, only active admins can reset their password via this flow.
    // If user is not found or not an admin, return the same safe success message to prevent user enumeration.
    const isAdmin =
      user &&
      user.isActive &&
      (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN);

    if (!isAdmin) {
      return {
        message:
          'If an administrator account with that email exists, a password reset link has been sent.',
      };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    const cfg = getAuthConfig(this.configService);
    const resetUrl = `${cfg.frontendUrl}/#/reset-password?token=${token}`;

    await this.mailService.sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl,
    });

    return {
      message:
        'If an administrator account with that email exists, a password reset link has been sent.',
      ...(process.env.NODE_ENV !== 'production' && !cfg.resendApiKey
        ? { devResetUrl: resetUrl }
        : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const cfg = getAuthConfig(this.configService);
    if (dto.newPassword.length < cfg.passwordMinLength) {
      throw new BadRequestException(
        `Password must be at least ${cfg.passwordMinLength} characters`,
      );
    }

    const now = new Date();
    const user = await this.userModel
      .findOne({
        resetPasswordToken: dto.token,
        resetPasswordExpires: { $gt: now },
      })
      .select('+passwordHash +resetPasswordToken +resetPasswordExpires')
      .exec();

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset link');
    }

    user.passwordHash = await bcrypt.hash(
      dto.newPassword,
      cfg.bcryptSaltRounds,
    );
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return {
      message:
        'Password has been reset successfully. You can now sign in with your new password.',
    };
  }

  logout(): { loggedOut: true } {
    return { loggedOut: true };
  }

  private async buildTokenResponse(user: User): Promise<AuthTokenResponse> {
    const cfg = getAuthConfig(this.configService);
    const payload: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: cfg.jwtExpiresIn,
      user: this.toUserView(user),
    };
  }

  private toUserView(user: User): AuthUserView {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ?? null,
    };
  }

  private async generateNextUserId(): Promise<string> {
    const existing = await this.userModel
      .find({ id: /^USR-\d+$/ }, { id: 1 })
      .lean<Pick<User, 'id'>[]>()
      .exec();

    const max = existing.reduce((mx, u) => {
      const num = Number(u.id.split('-')[1]) || 0;
      return Math.max(mx, num);
    }, 0);

    return `USR-${String(max + 1).padStart(3, '0')}`;
  }
}
