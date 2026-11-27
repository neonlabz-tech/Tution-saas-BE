import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
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
import {
  Student,
  type StudentDocument,
} from '../students/schemas/student.schema.js';
import { StudentsService } from '../students/students.service.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { LoginRateLimiterService } from '../auth/login-rate-limiter.service.js';
import type { StudentForgotPasswordDto } from './dto/student-forgot-password.dto.js';
import type { StudentLoginDto } from './dto/student-login.dto.js';
import type { StudentRegisterDto } from './dto/student-register.dto.js';
import type { StudentResetPasswordDto } from './dto/student-reset-password.dto.js';

export const STUDENT_COOKIE_NAME = 'eduflow_student_token';
export const STUDENT_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 1 day

@Injectable()
export class StudentAuthService {
  private readonly logger = new Logger(StudentAuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    private readonly studentsService: StudentsService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Optional()
    @Inject(LoginRateLimiterService)
    private readonly rateLimiter: LoginRateLimiterService = new LoginRateLimiterService(),
  ) {}

  async checkAccount(
    email: string,
  ): Promise<{ exists: boolean; mustChangePassword: boolean }> {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { exists: false, mustChangePassword: false };
    }
    const user = await this.userModel
      .findOne({ email: cleanEmail, role: Role.STUDENT })
      .lean<User>()
      .exec();
    if (!user) {
      return { exists: false, mustChangePassword: false };
    }
    return {
      exists: true,
      mustChangePassword: Boolean(user.mustChangePassword),
    };
  }

  async register(
    dto: StudentRegisterDto,
  ): Promise<{ message: string; studentId: string }> {
    const email = dto.email.trim().toLowerCase();

    // Check for existing user with same email
    const existingUser = await this.userModel.findOne({ email }).lean<User>().exec();
    if (existingUser) {
      throw new ConflictException(
        `An account with email "${email}" already exists`,
      );
    }

    // Create the student with pending status and student user account
    const created = await this.studentsService.create({
      fullName: dto.fullName.trim(),
      email,
      phone: dto.phone.trim(),
      dob: dto.dob,
      address: dto.address.trim(),
      guardianName: dto.guardianName.trim(),
      guardianPhone: dto.guardianPhone.trim(),
      batch: dto.batch.trim(),
      moduleIds: dto.moduleIds,
      enrollmentDate: new Date().toISOString().slice(0, 10),
      status: 'pending',
      password: dto.password,
      isSelfRegistered: true,
    });

    // Create admin notification for verification
    await this.notificationModel
      .create({
        id: `notif_stu_reg_${created.id}`,
        type: 'student',
        title: `Student Verification Required: ${dto.fullName.trim()}`,
        subtitle: `${dto.fullName.trim()} (${email}) has registered and is awaiting verification`,
        link: `/dashboard/students?status=pending`,
        read: false,
        recipientId: null,
      })
      .catch((err) => {
        this.logger.warn(
          `Failed to create student registration notification: ${err}`,
        );
      });

    return {
      message:
        'Registration received. Your account is pending administrator verification. You will receive an email once approved.',
      studentId: created.id,
    };
  }

  async login(dto: StudentLoginDto): Promise<{
    accessToken: string;
    user: {
      id: string;
      fullName: string;
      email: string;
      role: Role;
      studentId: string | null;
      status: string;
      mustChangePassword?: boolean;
    };
  }> {
    const email = dto.email.trim().toLowerCase();
    const cleanPassword = dto.password?.trim() || '';

    const lockout = this.rateLimiter.checkLockout(email);
    if (lockout.isLocked) {
      this.rateLimiter.throwTooManyRequests(lockout.retryAfter);
    }

    const user = await this.userModel
      .findOne({ email, role: Role.STUDENT })
      .select('+passwordHash')
      .exec();

    if (!user) {
      this.rateLimiter.recordFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account is pending administrator verification. Please wait until your registration is approved.',
      );
    }

    const valid =
      (await bcrypt.compare(cleanPassword, user.passwordHash)) ||
      (await bcrypt.compare(dto.password, user.passwordHash));

    if (!valid) {
      this.rateLimiter.recordFailure(email);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.rateLimiter.recordSuccess(email);

    const cfg = getAuthConfig(this.configService);
    let mustChangePassword = Boolean(user.mustChangePassword || user.lastLoginAt === null);

    if (dto.newPassword) {
      user.passwordHash = await bcrypt.hash(dto.newPassword, cfg.bcryptSaltRounds);
      user.mustChangePassword = false;
      mustChangePassword = false;
    }

    user.lastLoginAt = new Date();
    await user.save();
    const payload: AuthenticatedUser = {
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: cfg.jwtSecret,
      expiresIn: '1d',
    });

    return {
      accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        studentId: user.studentId ?? null,
        status: user.isActive ? 'active' : 'pending',
        mustChangePassword,
      },
    };
  }

  async me(userId: string) {
    const user = await this.userModel
      .findOne({ id: userId, role: Role.STUDENT, isActive: true })
      .lean<User>()
      .exec();

    if (!user) {
      throw new UnauthorizedException('Student account has been removed or deactivated');
    }

    let studentProfile = null;
    if (user.studentId) {
      studentProfile = await this.studentModel
        .findOne({ id: user.studentId })
        .lean()
        .exec();

      if (!studentProfile) {
        throw new UnauthorizedException('Student record no longer exists');
      }
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      studentId: user.studentId ?? null,
      mustChangePassword: Boolean(user.mustChangePassword),
      student: studentProfile,
    };
  }

  async changePassword(
    userId: string,
    dto: { newPassword: string; currentPassword?: string },
  ): Promise<{ message: string }> {
    const user = await this.userModel
      .findOne({ id: userId, role: Role.STUDENT })
      .select('+passwordHash')
      .exec();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.currentPassword) {
      const match = await bcrypt.compare(dto.currentPassword, user.passwordHash);
      if (!match) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    const cfg = getAuthConfig(this.configService);
    user.passwordHash = await bcrypt.hash(dto.newPassword, cfg.bcryptSaltRounds);
    user.mustChangePassword = false;
    await user.save();

    return { message: 'Password updated successfully' };
  }

  async forgotPassword(
    dto: StudentForgotPasswordDto,
  ): Promise<{ message: string; devResetUrl?: string }> {
    const email = dto.email.trim().toLowerCase();
    const cfg = getAuthConfig(this.configService);

    const safeMessage =
      'If a student account with that email exists, a password reset link has been sent.';

    const user = await this.userModel
      .findOne({ email, role: Role.STUDENT, isActive: true })
      .select('+resetPasswordToken +resetPasswordExpires')
      .exec();

    if (!user) {
      return { message: safeMessage };
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetPasswordToken = token;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    const resetUrl = `${cfg.frontendUrl}/student/reset-password?token=${token}`;

    if (!cfg.resendApiKey) {
      this.logger.warn(
        `[Resend API Key not set] Student password reset link for ${email}: ${resetUrl}`,
      );
    } else {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfg.resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: cfg.emailFrom,
            to: [email],
            subject: 'Reset your password - EduFlow Student Portal',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                <h2 style="color: #0f172a; margin-bottom: 16px;">Password Reset Request</h2>
                <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello ${user.fullName},</p>
                <p style="color: #334155; font-size: 15px; line-height: 1.5;">
                  We received a request to reset the password for your student portal account on <strong>${cfg.instituteName}</strong>.
                </p>
                <div style="margin: 28px 0; text-align: center;">
                  <a href="${resetUrl}" style="background-color: #6366f1; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                    Reset Password
                  </a>
                </div>
                <p style="color: #64748b; font-size: 13px; line-height: 1.4;">
                  This link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email.
                </p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                <p style="color: #94a3b8; font-size: 12px;">
                  Button not working? Copy and paste this URL into your browser:<br />
                  <a href="${resetUrl}" style="color: #6366f1; word-break: break-all;">${resetUrl}</a>
                </p>
              </div>
            `,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(
            `Resend API call failed (${response.status}): ${errorText}`,
          );
        } else {
          this.logger.log(`Student password reset email sent to ${email} via Resend`);
        }
      } catch (err) {
        this.logger.error(
          `Error sending student password reset email to ${email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return {
      message: safeMessage,
      ...(process.env.NODE_ENV !== 'production' ? { devResetUrl: resetUrl } : {}),
    };
  }

  async validateResetToken(token: string): Promise<boolean> {
    const now = new Date();
    const user = await this.userModel
      .findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: now },
        role: Role.STUDENT,
      })
      .lean()
      .exec();
    return Boolean(user);
  }

  async resetPassword(dto: StudentResetPasswordDto): Promise<{ message: string }> {
    const now = new Date();

    const user = await this.userModel
      .findOne({
        resetPasswordToken: dto.token,
        resetPasswordExpires: { $gt: now },
        role: Role.STUDENT,
      })
      .select('+passwordHash +resetPasswordToken +resetPasswordExpires')
      .exec();

    if (!user) {
      throw new NotFoundException('Invalid or expired password reset link');
    }

    const cfg = getAuthConfig(this.configService);
    user.passwordHash = await bcrypt.hash(dto.newPassword, cfg.bcryptSaltRounds);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return { message: 'Password reset successful' };
  }
}
