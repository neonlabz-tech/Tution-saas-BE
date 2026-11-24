import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Counter, CounterSchema } from '../students/schemas/counter.schema.js';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';
import { R2StorageService } from './r2-storage.service.js';
import { Notice, NoticeSchema } from './schemas/notice.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notice.name, schema: NoticeSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  controllers: [NoticesController],
  providers: [NoticesService, R2StorageService],
  exports: [NoticesService],
})
export class NoticesModule {}
