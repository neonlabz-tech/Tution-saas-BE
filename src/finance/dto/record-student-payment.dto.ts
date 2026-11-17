import { z } from 'zod';
import { INCOME_CATEGORIES, PAYMENT_METHODS } from '../finance.constants.js';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const recordStudentPaymentSchema = z.object({
  studentId: z.string().trim().min(1, 'studentId is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  category: z.enum(INCOME_CATEGORIES).default('Tuition fees'),
  method: z.enum(PAYMENT_METHODS),
  date: z
    .string()
    .trim()
    .regex(isoDateRegex, 'Date must be in YYYY-MM-DD format')
    .optional(),
  description: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional(),
});

export type RecordStudentPaymentDto = z.infer<
  typeof recordStudentPaymentSchema
>;
