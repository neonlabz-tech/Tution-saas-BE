import { z } from 'zod';
import { ModuleStatus } from '../../enums/status.enum.js';

export const createModuleSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Module code must be at least 3 characters')
    .transform((val) => val.toUpperCase()),
  name: z
    .string()
    .trim()
    .min(3, 'Module name must be at least 3 characters'),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters'),
  fee: z
    .number({ message: 'Fee must be a valid number' })
    .min(1000, 'Fee must be at least LKR 1,000'),
  duration: z
    .string()
    .trim()
    .min(2, 'Duration must be at least 2 characters'),
  teacherId: z.preprocess(
    (val) =>
      !val || (typeof val === 'string' && val.trim() === '') ? null : val,
    z.string().trim().nullable().optional().default(null),
  ),
  batches: z
    .array(z.string().trim().min(1, 'Batch name cannot be empty'))
    .min(1, 'Assign at least one batch')
    .transform((batches) => Array.from(new Set(batches))),
  status: z.nativeEnum(ModuleStatus).default(ModuleStatus.ACTIVE),
});

export type CreateModuleDto = z.infer<typeof createModuleSchema>;
