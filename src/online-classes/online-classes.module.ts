import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Notification,
  NotificationSchema,
} from '../notifications/schemas/notification.schema.js';
import { OnlineClassesController } from './online-classes.controller.js';
import { OnlineClassesService } from './online-classes.service.js';
import {
  OnlineClass,
  OnlineClassSchema,
} from './schemas/online-class.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OnlineClass.name, schema: OnlineClassSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
  ],
  controllers: [OnlineClassesController],
  providers: [OnlineClassesService],
  exports: [OnlineClassesService],
})
export class OnlineClassesModule {}
