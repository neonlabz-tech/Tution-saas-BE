import { setServers } from 'node:dns';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { ResponseInterceptor } from './common/interceptors/index.js';
import { getDatabaseConfig } from './config/database.config.js';
import { validateEnvironment } from './config/env.validation.js';
import { MailModule } from './mail/mail.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { ModulesModule } from './modules/modules.module.js';
import { NoticesModule } from './notices/notices.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OnlineClassesModule } from './online-classes/online-classes.module.js';
import { OverviewModule } from './overview/overview.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StorageModule } from './storage/storage.module.js';
import { StudentAuthModule } from './student-auth/student-auth.module.js';
import { StudentsModule } from './students/students.module.js';
import { TeachersModule } from './teachers/teachers.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),

    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com,
    // then run `npx @nestjs/observe link` to write your key pair into .env.
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'tution-saas-be',
    }),

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dnsServers = config
          .get<string>('MONGODB_DNS_SERVERS')
          ?.split(',')
          .map((server) => server.trim())
          .filter(Boolean);
        if (dnsServers && dnsServers.length > 0) {
          setServers(dnsServers);
        }

        return getDatabaseConfig(config);
      },
    }),

    AuthModule,
    StudentAuthModule,
    BatchesModule,
    NoticesModule,
    NotificationsModule,
    OnlineClassesModule,
    OverviewModule,
    SettingsModule,
    StorageModule,
    TeachersModule,
    MailModule,
    StudentsModule,
    ModulesModule,
    FinanceModule,
    PaymentsModule,
    AttendanceModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
