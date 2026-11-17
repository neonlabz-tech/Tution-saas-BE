import { z } from 'zod';
import { TxType } from '../../enums/status.enum.js';
import { PAYMENT_METHODS } from '../finance.constants.js';
import { isValidCategoryForType } from './create-transaction.dto.js';

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const updateTransactionSchema = z
  .object({
    type: z.enum([TxType.INCOME, TxType.EXPENSE]).optional(),
    category: z.string().trim().min(1, 'Category cannot be empty').optional(),
    amount: z.coerce
      .number()
      .positive('Amount must be greater than 0')
      .optional(),
    date: z
      .string()
      .trim()
      .regex(isoDateRegex, 'Date must be in YYYY-MM-DD format')
      .optional(),
    description: z.string().trim().optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
    studentId: z
      .string()
      .trim()
      .transform((value) => (value ? value : null))
      .nullable()
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type && data.category && !isValidCategoryForType(data.type, data.category)) {
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: `Category "${data.category}" is not valid for type "${data.type}"`,
      });
    }
  });

export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;
