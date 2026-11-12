import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Notice, NoticeSchema } from './schemas/notice.schema.js';
import { NoticesController } from './notices.controller.js';
import { NoticesService } from './notices.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Notice.name, schema: NoticeSchema }]),
  ],
  controllers: [NoticesController],
  providers: [NoticesService],
})
export class NoticesModule {}
