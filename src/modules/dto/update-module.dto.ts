import { z } from 'zod';
import { ModuleStatus } from '../../enums/status.enum.js';

export const updateModuleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Module code must be at least 3 characters')
    .transform((val) => val.toUpperCase())
    .optional(),
  name: z
    .string()
    .trim()
    .min(3, 'Module name must be at least 3 characters')
    .optional(),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .optional(),
  fee: z
    .number({ message: 'Fee must be a valid number' })
    .min(1000, 'Fee must be at least LKR 1,000')
    .optional(),
  duration: z
    .string()
    .trim()
    .min(2, 'Duration must be at least 2 characters')
    .optional(),
  teacherId: z.preprocess(
    (val) =>
      !val || (typeof val === 'string' && val.trim() === '') ? null : val,
    z.string().trim().nullable().optional(),
  ),
  batches: z
    .array(z.string().trim().min(1, 'Batch name cannot be empty'))
    .min(1, 'A module needs at least one batch')
    .transform((batches) => Array.from(new Set(batches)))
    .optional(),
  status: z.nativeEnum(ModuleStatus).optional(),
});

export type UpdateModuleDto = z.infer<typeof updateModuleSchema>;
