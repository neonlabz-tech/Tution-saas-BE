import { z } from 'zod';
import {
  FINANCE_PERIODS,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from '../../finance/finance.constants.js';
import { STUDENT_STATUSES } from '../../students/schemas/student.schema.js';
import { PAYMENT_STATUSES } from '../schemas/payment.schema.js';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((value) => (value ? value : undefined))
  .optional();

const optionalDateString = z
  .string()
  .trim()
  .regex(isoDateRegex, 'Date must be in YYYY-MM-DD format')
  .optional();

const optionalBooleanFlag = z
  .preprocess((value) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  }, z.boolean())
  .default(false);

export const paymentsListQuerySchema = z.object({
  q: optionalTrimmedString,
  studentId: optionalTrimmedString,
  method: z.enum(PAYMENT_METHODS).optional(),
  category: z.enum(INCOME_CATEGORIES).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  period: z.enum(FINANCE_PERIODS).optional(),
  from: optionalDateString,
  to: optionalDateString,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export const paymentStudentsQuerySchema = z.object({
  q: optionalTrimmedString,
  batch: optionalTrimmedString,
  status: z.enum(STUDENT_STATUSES).optional(),
  paymentStatus: z.enum(['paid', 'partial', 'unpaid']).optional(),
  debtorsOnly: optionalBooleanFlag,
  includeGraduated: optionalBooleanFlag,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export type PaymentsListQueryDto = z.infer<typeof paymentsListQuerySchema>;
export type PaymentStudentsQueryDto = z.infer<typeof paymentStudentsQuerySchema>;
