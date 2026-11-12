import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from '../attendance/schemas/attendance.schema.js';
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
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema.js';
import { OverviewController } from './overview.controller.js';
import { OverviewService } from './overview.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: Teacher.name, schema: TeacherSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: OnlineClass.name, schema: OnlineClassSchema },
      { name: Notice.name, schema: NoticeSchema },
    ]),
  ],
  controllers: [OverviewController],
  providers: [OverviewService],
  exports: [OverviewService],
})
export class OverviewModule {}
