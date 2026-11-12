import { z } from 'zod';
import { baseStudentSchema } from './create-student.dto.js';

export const updateStudentSchema = baseStudentSchema.partial();

export type UpdateStudentDto = z.infer<typeof updateStudentSchema>;
