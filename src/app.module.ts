import { setServers } from 'node:dns';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MongooseModule } from '@nestjs/mongoose';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ResponseInterceptor } from './common/interceptors/index.js';
import { validateEnvironment } from './config/env.validation.js';
import { MailModule } from './mail/mail.module.js';
import { StudentsModule } from './students/students.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnvironment,
    }),

    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY',
      appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET',
      serviceId: 'tution-saas-be',
    }),

    EventEmitterModule.forRoot(),

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

        return {
          uri:
            config.get<string>('MONGODB_URI') || config.get<string>('MONGO_URI'),
        };
      },
    }),

    MailModule,
    StudentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
