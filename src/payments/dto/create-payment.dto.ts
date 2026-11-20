import { z } from 'zod';
import { INCOME_CATEGORIES, PAYMENT_METHODS } from '../../finance/finance.constants.js';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

function todayUtcIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export const createPaymentSchema = z.object({
  studentId: z.string().trim().min(1, 'studentId is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  discount: z.coerce
    .number()
    .min(0, 'Discount must be 0 or greater')
    .default(0),
  method: z.enum(PAYMENT_METHODS),
  category: z.enum(INCOME_CATEGORIES).default('Tuition fees'),
  date: z
    .string()
    .trim()
    .regex(isoDateRegex, 'Date must be in YYYY-MM-DD format')
    .default(() => todayUtcIsoDate()),
  description: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional(),
});

export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;
