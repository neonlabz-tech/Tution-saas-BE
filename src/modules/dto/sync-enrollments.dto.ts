import { z } from 'zod';

export const syncEnrollmentsSchema = z.object({
  studentIds: z
    .array(z.string().trim().min(1, 'Student ID cannot be empty'))
    .transform((ids) => Array.from(new Set(ids))),
});

export type SyncEnrollmentsDto = z.infer<typeof syncEnrollmentsSchema>;
