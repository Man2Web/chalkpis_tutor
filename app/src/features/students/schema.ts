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
  dueDay: z.number().int().min(1).max(31),
  notifyParent: z.boolean(),
  notes: z.string().max(500).optional(),
});

export type StudentForm = z.infer<typeof studentSchema>;
