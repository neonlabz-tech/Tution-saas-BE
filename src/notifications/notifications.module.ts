import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Transaction,
  TransactionSchema,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  CourseModuleSchema,
} from '../modules/schemas/module.schema.js';
import { Notice, NoticeSchema } from '../notices/schemas/notice.schema.js';
import {
  OnlineClass,
  OnlineClassSchema,
} from '../online-classes/schemas/online-class.schema.js';
import {
  Settings,
  SettingsSchema,
} from '../settings/schemas/settings.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import {
  Notification,
  NotificationSchema,
} from './schemas/notification.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: Notice.name, schema: NoticeSchema },
      { name: OnlineClass.name, schema: OnlineClassSchema },
      { name: Student.name, schema: StudentSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Settings.name, schema: SettingsSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
