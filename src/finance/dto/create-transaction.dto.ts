import { z } from 'zod';
import { TxType } from '../../enums/status.enum.js';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from '../finance.constants.js';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export function isValidCategoryForType(type: TxType, category: string): boolean {
  if (type === TxType.INCOME) {
    return (INCOME_CATEGORIES as readonly string[]).includes(category);
  }
  return (EXPENSE_CATEGORIES as readonly string[]).includes(category);
}

export const createTransactionSchema = z
  .object({
    type: z.enum([TxType.INCOME, TxType.EXPENSE]),
    category: z.string().trim().min(1, 'Category is required'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    date: z
      .string()
      .trim()
      .regex(isoDateRegex, 'Date must be in YYYY-MM-DD format')
      .optional(),
    description: z.string().trim().default(''),
    method: z.enum(PAYMENT_METHODS).optional(),
    studentId: z
      .string()
      .trim()
      .transform((value) => (value ? value : undefined))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!isValidCategoryForType(data.type, data.category)) {
      const allowed =
        data.type === TxType.INCOME ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: `Invalid category "${data.category}" for type "${data.type}". Allowed: ${allowed.join(', ')}`,
      });
    }
  });

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
