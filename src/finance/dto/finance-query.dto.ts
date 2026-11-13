import { z } from 'zod';
import { TxType } from '../../enums/status.enum.js';
import { FINANCE_PERIODS } from '../finance.constants.js';

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

const basePeriodFields = {
  period: z.enum(FINANCE_PERIODS).optional(),
  from: optionalDateString,
  to: optionalDateString,
  category: optionalTrimmedString,
};

export const financeKpisQuerySchema = z.object(basePeriodFields);

export const financeChartsQuerySchema = z.object(basePeriodFields);

export const financeTransactionsQuerySchema = z.object({
  ...basePeriodFields,
  type: z.enum([TxType.INCOME, TxType.EXPENSE]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
});

export type FinanceKpisQueryDto = z.infer<typeof financeKpisQuerySchema>;
export type FinanceChartsQueryDto = z.infer<typeof financeChartsQuerySchema>;
export type FinanceTransactionsQueryDto = z.infer<
  typeof financeTransactionsQuerySchema
>;
