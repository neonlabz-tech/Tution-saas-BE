import { z } from 'zod';
import { studentStatusSchema } from './create-student.dto.js';

export const studentQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional(),
  batch: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional(),
  moduleId: z
    .string()
    .trim()
    .transform((value) => (value ? value : undefined))
    .optional(),
  status: studentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(8),
  sortBy: z
    .enum([
      'fullName',
      'id',
      'batch',
      'enrollmentDate',
      'status',
      'createdAt',
      'feeTotal',
      'paidTotal',
      'outstanding',
    ])
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type StudentQueryDto = z.infer<typeof studentQuerySchema>;
