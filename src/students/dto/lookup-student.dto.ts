import { z } from 'zod';

export const lookupStudentQuerySchema = z.object({
  code: z.string().trim().min(1, 'Lookup code is required'),
});

export type LookupStudentQueryDto = z.infer<typeof lookupStudentQuerySchema>;
