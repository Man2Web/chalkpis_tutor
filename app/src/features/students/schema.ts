import { z } from 'zod';
import { normalizeIndianPhone } from '../../lib/phone';
import { parseRupeesToPaise } from '../../lib/money';

const phone = (msg = 'phone') => z.string().refine((v) => normalizeIndianPhone(v) !== null, msg);

export const studentSchema = z.object({
  name: z.string().trim().min(2, 'required').max(80),
  phone: z.string().refine((v) => v.trim() === '' || normalizeIndianPhone(v) !== null, 'phone'),
  parentName: z.string().trim().max(80),
  parentPhone: phone(),
  class: z.string().trim().max(30),
  monthlyFee: z.string().refine((v) => parseRupeesToPaise(v) !== null, 'amount'),
  feeCycle: z.enum(['monthly', 'quarterly', 'one-time']),
  dueDay: z.number().int('dueDay').min(1, 'dueDay').max(31, 'dueDay'),
  notifyParent: z.boolean(),
  notes: z.string().max(500).optional(),
  /** yyyy-mm-dd or blank; never in the future. */
  dob: z
    .string()
    .refine(
      (v) =>
        v === '' ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          v <= new Date().toISOString().slice(0, 10)),
      'date',
    )
    .optional(),
  gender: z.enum(['', 'male', 'female', 'other']).optional(),
  /** yyyy-mm-dd; blank = today (new student) / unchanged (edit). */
  joinedOn: z
    .string()
    .refine(
      (v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))),
      'date',
    )
    .optional(),
});

export type StudentForm = z.infer<typeof studentSchema>;
