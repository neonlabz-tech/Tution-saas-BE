import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CourseModule,
  CourseModuleSchema,
} from '../modules/schemas/module.schema.js';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema.js';
import { Counter, CounterSchema } from '../students/schemas/counter.schema.js';
import { Student, StudentSchema } from '../students/schemas/student.schema.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { Transaction, TransactionSchema } from './schemas/transaction.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Student.name, schema: StudentSchema },
      { name: CourseModule.name, schema: CourseModuleSchema },
      { name: Counter.name, schema: CounterSchema },
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
