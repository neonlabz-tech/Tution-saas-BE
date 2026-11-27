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
  Payment,
  PaymentSchema,
} from '../payments/schemas/payment.schema.js';
import { MailModule } from '../mail/mail.module.js';
import {
  CourseModule,
  CourseModuleSchema,
} from '../modules/schemas/module.schema.js';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { StudentRegisteredListener } from './listeners/student-registered.listener.js';
import { Counter, CounterSchema } from './schemas/counter.schema.js';
import { Student, StudentSchema } from './schemas/student.schema.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
      { name: Counter.name, schema: CounterSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: AttendanceRecord.name, schema: AttendanceRecordSchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService, StudentRegisteredListener],
  exports: [StudentsService],
})
export class StudentsModule {}
