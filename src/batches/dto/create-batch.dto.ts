import { z } from 'zod';

export const createBatchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Batch name must be at least 2 characters'),
  code: z.string().trim().optional().default(''),
  year: z.string().trim().optional().default(''),
  description: z.string().trim().optional().default(''),
  status: z.enum(['active', 'upcoming', 'archived']).optional().default('active'),
  category: z.enum(['al', 'grade']).optional().default('al'),
});

export type CreateBatchDto = z.infer<typeof createBatchSchema>;
