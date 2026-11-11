import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CourseModule,
  CourseModuleSchema,
} from '../modules/schemas/module.schema.js';
import {
  OnlineClass,
  OnlineClassSchema,
} from '../online-classes/schemas/online-class.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { Teacher, TeacherSchema } from './schemas/teacher.schema.js';
import { TeachersController } from './teachers.controller.js';
import { TeachersService } from './teachers.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Teacher.name, schema: TeacherSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: Student.name, schema: StudentSchema },
      { name: OnlineClass.name, schema: OnlineClassSchema },
    ]),
  ],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
