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
import {
  Student,
  StudentSchema,
} from '../students/schemas/student.schema.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from './schemas/attendance.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: Student.name, schema: StudentSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
