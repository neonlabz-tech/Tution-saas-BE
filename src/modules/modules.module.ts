import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  AttendanceRecord,
  AttendanceRecordSchema,
} from '../attendance/schemas/attendance.schema.js';
import {
  OnlineClass,
  OnlineClassSchema,
} from '../online-classes/schemas/online-class.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema.js';
import { ModulesController } from './modules.controller.js';
import { ModulesService } from './modules.service.js';
import {
  CourseModule,
  CourseModuleSchema,
} from './schemas/module.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: Teacher.name, schema: TeacherSchema },
      { name: Student.name, schema: StudentSchema },
      { name: OnlineClass.name, schema: OnlineClassSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
    ]),
  ],
  controllers: [ModulesController],
  providers: [ModulesService],
  exports: [ModulesService],
})
export class ModulesModule {}
