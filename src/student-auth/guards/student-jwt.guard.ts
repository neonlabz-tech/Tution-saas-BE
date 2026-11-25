import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { getAuthConfig } from '../../config/auth.config.js';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator.js';
import { Role } from '../../enums/role.enum.js';
import { User, type UserDocument } from '../../users/schemas/user.schema.js';
import { STUDENT_COOKIE_NAME } from '../student-auth.service.js';

@Injectable()
export class StudentJwtGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string; cookie?: string };
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    // Try cookie first
    const cookieToken = request.cookies?.[STUDENT_COOKIE_NAME] ?? this.extractCookieToken(request.headers?.cookie);
    // Also accept Bearer token for API clients
    const authHeader = request.headers?.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;

    const token = cookieToken || bearerToken;

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    try {
      const { jwtSecret } = getAuthConfig(this.configService);
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(
        token,
        { secret: jwtSecret },
      );

      if (payload.role !== Role.STUDENT) {
        throw new UnauthorizedException('Invalid token: not a student token');
      }

      // Check that the student account still exists and is active in the database
      const user = await this.userModel
        .findOne({ id: payload.sub, role: Role.STUDENT, isActive: true })
        .lean()
        .exec();

      if (!user) {
        throw new UnauthorizedException(
          'Student account has been deleted or deactivated',
        );
      }

      request.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }

  private extractCookieToken(
    cookieHeader?: string,
  ): string | null {
    if (!cookieHeader) return null;
    const prefix = `${STUDENT_COOKIE_NAME}=`;
    for (const part of cookieHeader.split(';')) {
      const trimmed = part.trim();
      if (trimmed.startsWith(prefix)) {
        const value = trimmed.slice(prefix.length).trim();
        return value ? decodeURIComponent(value) : null;
      }
    }
    return null;
  }
}
