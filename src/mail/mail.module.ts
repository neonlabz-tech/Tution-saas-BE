import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  FileMailTransport,
  LogMailTransport,
  MailModule as NestMailModule,
  ResendTransport,
  SmtpTransport,
  type MailTransport,
} from '@nestjs/mail';
import { MailService } from './mail.service.js';

function createMailTransport(configService: ConfigService): MailTransport {
  const logger = new Logger('MailModule');
  const transportMode = configService.get<string>('MAIL_TRANSPORT')?.toLowerCase();
  const host = configService.get<string>('MAIL_HOST')?.trim();
  const resendApiKey = (
    configService.get<string>('RESEND_API_KEY') ||
    configService.get<string>('MAIL_PASS')
  )?.trim();

  if (transportMode === 'file') {
    const directory = configService.get<string>('MAIL_DIRECTORY', 'var/mail');
    return new FileMailTransport({ directory });
  }

  if (transportMode === 'resend' || (!host && resendApiKey)) {
    if (resendApiKey) {
      logger.log('Using ResendTransport with onboarding@resend.dev');
      return new ResendTransport({ apiKey: resendApiKey });
    }
    logger.warn(
      'Resend transport requested but RESEND_API_KEY is not configured — using LogMailTransport.',
    );
    return new LogMailTransport();
  }

  if (transportMode === 'log' || (!host && transportMode !== 'smtp')) {
    if (!host) {
      logger.warn(
        'MAIL_HOST is not configured — using LogMailTransport (emails will be logged instead of sent over SMTP).',
      );
    }
    return new LogMailTransport();
  }

  const port = Number(configService.get<string>('MAIL_PORT', '587'));
  const secureEnv = configService.get<string>('MAIL_SECURE');
  const secure =
    secureEnv !== undefined ? secureEnv === 'true' : port === 465;
  const user = configService.get<string>('MAIL_USER')?.trim();
  const pass = configService.get<string>('MAIL_PASS');

  return new SmtpTransport({
    host: host!,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

@Module({
  imports: [
    NestMailModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const appName = configService.get<string>('APP_NAME', 'EduFlow');
        const from =
          configService.get<string>('EMAIL_FROM') ||
          configService.get<string>('MAIL_FROM') ||
          `${appName} <onboarding@resend.dev>`;
        return {
          transport: createMailTransport(configService),
          from,
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
