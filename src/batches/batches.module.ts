import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CourseModule, CourseModuleSchema } from '../modules/schemas/module.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { Teacher, TeacherSchema } from '../teachers/schemas/teacher.schema.js';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';
import { Batch, BatchSchema } from './schemas/batch.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Batch.name, schema: BatchSchema },
      { name: Student.name, schema: StudentSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: Teacher.name, schema: TeacherSchema },
    ]),
  ],
  controllers: [BatchesController],
  providers: [BatchesService],
  exports: [BatchesService],
})
export class BatchesModule {}
