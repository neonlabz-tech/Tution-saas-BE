import type { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

export interface AuthRuntimeConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptSaltRounds: number;
  allowSelfRegistration: boolean;
  passwordMinLength: number;
  instituteName: string;
  defaultAdminName: string;
  defaultAdminEmail: string;
  defaultAdminPassword: string;
  resendApiKey: string;
  emailFrom: string;
  frontendUrl: string;
}

export function getAuthConfig(
  configService: ConfigService,
): AuthRuntimeConfig {
  const saltRoundsRaw = Number(
    configService.get<string>('BCRYPT_SALT_ROUNDS') ?? 10,
  );
  const passwordMinRaw = Number(
    configService.get<string>('AUTH_PASSWORD_MIN_LENGTH') ?? 8,
  );

  return {
    jwtSecret:
      configService.get<string>('JWT_SECRET') ||
      'eduflow-dev-jwt-secret-change-in-prod',
    jwtExpiresIn: configService.get<string>('JWT_EXPIRES_IN') || '7d',
    bcryptSaltRounds:
      Number.isFinite(saltRoundsRaw) && saltRoundsRaw >= 4 ? saltRoundsRaw : 10,
    allowSelfRegistration:
      (configService.get<string>('AUTH_ALLOW_REGISTRATION') ?? 'false') ===
      'true',
    passwordMinLength:
      Number.isFinite(passwordMinRaw) && passwordMinRaw >= 6
        ? passwordMinRaw
        : 8,
    instituteName:
      configService.get<string>('INSTITUTE_NAME') || 'Bright Future Institute',
    defaultAdminName:
      configService.get<string>('ADMIN_DEFAULT_NAME') || 'Admin',
    defaultAdminEmail:
      configService.get<string>('ADMIN_DEFAULT_EMAIL') || '',
    defaultAdminPassword:
      configService.get<string>('ADMIN_DEFAULT_PASSWORD') || '',
    resendApiKey: configService.get<string>('RESEND_API_KEY') || '',
    emailFrom:
      configService.get<string>('EMAIL_FROM') ||
      configService.get<string>('MAIL_FROM') ||
      'EduFlow <onboarding@resend.dev>',
    frontendUrl:
      (configService.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/+$/, ''),
  };
}

export function getJwtModuleOptions(
  configService: ConfigService,
): JwtModuleOptions {
  const cfg = getAuthConfig(configService);
  return {
    secret: cfg.jwtSecret,
    signOptions: {
      expiresIn: cfg.jwtExpiresIn as `${number}${'s' | 'm' | 'h' | 'd'}`,
    },
  };
}
