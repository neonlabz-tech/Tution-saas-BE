import { z } from 'zod';
import { ModuleStatus } from '../../enums/status.enum.js';

export const moduleQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .transform((val) => (val ? val : undefined))
    .optional(),
  status: z.nativeEnum(ModuleStatus).optional(),
  teacherId: z
    .string()
    .trim()
    .transform((val) => (val ? val : undefined))
    .optional(),
  batch: z
    .string()
    .trim()
    .transform((val) => (val ? val : undefined))
    .optional(),
});

export type ModuleQueryDto = z.infer<typeof moduleQuerySchema>;
