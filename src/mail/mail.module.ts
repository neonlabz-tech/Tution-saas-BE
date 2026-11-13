import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  FileMailTransport,
  LogMailTransport,
  MailModule as NestMailModule,
  SmtpTransport,
  type MailTransport,
} from '@nestjs/mail';
import { MailService } from './mail.service.js';

function createMailTransport(configService: ConfigService): MailTransport {
  const logger = new Logger('MailModule');
  const transportMode = configService.get<string>('MAIL_TRANSPORT');
  const host = configService.get<string>('MAIL_HOST')?.trim();

  if (transportMode === 'file') {
    const directory = configService.get<string>('MAIL_DIRECTORY', 'var/mail');
    return new FileMailTransport({ directory });
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
        const instituteName = configService.get<string>(
          'INSTITUTE_NAME',
          'Bright Future Institute',
        );
        return {
          transport: createMailTransport(configService),
          from: configService.get<string>(
            'MAIL_FROM',
            `${instituteName} <no-reply@eduflow.lk>`,
          ),
        };
      },
    }),
  ],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
