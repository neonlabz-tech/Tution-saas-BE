import { z } from 'zod';
import { INCOME_CATEGORIES, PAYMENT_METHODS } from '../../finance/finance.constants.js';
import { PAYMENT_STATUSES } from '../schemas/payment.schema.js';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const updatePaymentSchema = z.object({
  amount: z.coerce
    .number()
    .positive('Amount must be greater than 0')
    .optional(),
  discount: z.coerce
    .number()
    .min(0, 'Discount must be 0 or greater')
    .optional(),
  method: z.enum(PAYMENT_METHODS).optional(),
  category: z.enum(INCOME_CATEGORIES).optional(),
  date: z
    .string()
    .trim()
    .regex(isoDateRegex, 'Date must be in YYYY-MM-DD format')
    .optional(),
  description: z.string().trim().optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
});

export type UpdatePaymentDto = z.infer<typeof updatePaymentSchema>;
