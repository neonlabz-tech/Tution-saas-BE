import { z } from 'zod';

export const updateBatchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Batch name must be at least 2 characters')
    .optional(),
  code: z.string().trim().optional(),
  year: z.string().trim().optional(),
  description: z.string().trim().optional(),
  status: z.enum(['active', 'upcoming', 'archived']).optional(),
  category: z.enum(['al', 'grade']).optional(),
});

export type UpdateBatchDto = z.infer<typeof updateBatchSchema>;
