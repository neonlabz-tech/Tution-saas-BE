import { z } from 'zod';
import { STUDENT_STATUSES } from '../schemas/student.schema.js';

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearStr, monthStr, dayStr] = value.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const phoneSchema = z
  .string()
  .trim()
  .regex(/^0\d{9}$/, 'Phone must be 10 digits starting with 0');

export const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Date must be a valid calendar date');

export const studentStatusSchema = z.enum(STUDENT_STATUSES);

export const baseStudentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'Full name must be at least 3 characters'),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address')
    .transform((value) => value.toLowerCase()),
  phone: phoneSchema,
  dob: isoDateSchema,
  address: z
    .string()
    .trim()
    .min(5, 'Address must be at least 5 characters'),
  guardianName: z
    .string()
    .trim()
    .min(3, 'Guardian name must be at least 3 characters'),
  guardianPhone: phoneSchema,
  batch: z.string().trim().min(1, 'Batch is required'),
  moduleIds: z
    .array(z.string().trim().min(1, 'Module ID cannot be empty'))
    .min(1, 'At least one module is required')
    .transform((ids) => Array.from(new Set(ids))),
  enrollmentDate: isoDateSchema,
  status: studentStatusSchema,
});

export const createStudentSchema = baseStudentSchema.extend({
  enrollmentDate: isoDateSchema.default(() => todayIsoDate()),
  status: studentStatusSchema.default('pending'),
});

export type CreateStudentDto = z.infer<typeof createStudentSchema>;
