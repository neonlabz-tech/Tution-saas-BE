import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
