import { z } from 'zod';
import { ModuleStatus } from '../../enums/status.enum.js';
import { FINANCE_PERIODS } from '../../finance/finance.constants.js';

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

export const analyticsOverviewQuerySchema = z.object({
  period: z.enum(FINANCE_PERIODS).optional(),
  from: optionalDateString,
  to: optionalDateString,
  batch: optionalTrimmedString,
  moduleId: optionalTrimmedString,
});

export const analyticsModulePerformanceQuerySchema = z.object({
  period: z.enum(FINANCE_PERIODS).optional(),
  from: optionalDateString,
  to: optionalDateString,
  status: z
    .enum([ModuleStatus.ACTIVE, ModuleStatus.UPCOMING, ModuleStatus.ARCHIVED])
    .optional(),
});

export type AnalyticsOverviewQueryDto = z.infer<
  typeof analyticsOverviewQuerySchema
>;
export type AnalyticsModulePerformanceQueryDto = z.infer<
  typeof analyticsModulePerformanceQuerySchema
>;
