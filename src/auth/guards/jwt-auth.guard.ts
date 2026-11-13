import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getAuthConfig } from '../../config/auth.config.js';
import type { AuthenticatedUser } from '../../decorators/current-user.decorator.js';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator.js';
import { AUTH_COOKIE_NAME, extractCookieToken } from '../auth-cookie.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers?: { authorization?: string; cookie?: string };
      cookies?: Record<string, string | undefined>;
      user?: AuthenticatedUser;
    }>();

    const cookieToken =
      request.cookies?.[AUTH_COOKIE_NAME] ??
      extractCookieToken(request.headers?.cookie);
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
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }
}
