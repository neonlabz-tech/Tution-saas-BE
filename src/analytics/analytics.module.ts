import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from '../attendance/schemas/attendance.schema.js';
import { FinanceModule } from '../finance/finance.module.js';
import {
  Transaction,
  TransactionSchema,
} from '../finance/schemas/transaction.schema.js';
import {
  CourseModule,
  CourseModuleSchema,
} from '../modules/schemas/module.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [
    FinanceModule,
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Teacher.name, schema: TeacherSchema },
    ]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
