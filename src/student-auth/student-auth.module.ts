import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { getJwtModuleOptions } from '../config/auth.config.js';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { StudentsModule } from '../students/students.module.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { LoginRateLimiterService } from '../auth/login-rate-limiter.service.js';
import { StudentJwtGuard } from './guards/student-jwt.guard.js';
import { StudentAuthController } from './student-auth.controller.js';
import { StudentAuthService } from './student-auth.service.js';

@Module({
  imports: [
    ConfigModule,
    StudentsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getJwtModuleOptions,
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [StudentAuthController],
  providers: [StudentAuthService, StudentJwtGuard, LoginRateLimiterService],
  exports: [StudentAuthService, StudentJwtGuard],
})
export class StudentAuthModule {}
