import { z } from 'zod';
import { normalizeIndianPhone } from '../lib/phone.js';

const parentPhone = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const p = normalizeIndianPhone(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'phone' });
    return p ?? '';
  });
const optionalPhone = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    if (v.trim() === '') return '';
    const p = normalizeIndianPhone(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'phone' });
    return p ?? '';
  });

const fields = {
  name: z.string().trim().min(2).max(80),
  phone: optionalPhone,
  parentName: z.string().trim().max(80),
  parentPhone,
  class: z.string().trim().max(30),
  monthlyFee: z.number().int().min(0).max(100_000_000),
  feeCycle: z.enum(['monthly', 'quarterly', 'one-time']),
  dueDay: z.number().int().min(1).max(31),
  discount: z.number().int().min(0).max(100_000_000),
  notifyParent: z.boolean(),
  notes: z.string().max(500),
  // yyyy-mm-dd, or '' for not given
  dob: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  gender: z.enum(['', 'male', 'female', 'other']),
  joinedAt: z.string().datetime().optional(),
  batchIds: z.array(z.string().uuid()).max(20),
};

export const studentInput = z.object({
  name: fields.name,
  parentPhone: fields.parentPhone,
  phone: fields.phone.default(''),
  parentName: fields.parentName.default(''),
  class: fields.class.default(''),
  monthlyFee: fields.monthlyFee.default(0),
  feeCycle: fields.feeCycle.default('monthly'),
  dueDay: fields.dueDay.default(1),
  discount: fields.discount.default(0),
  notifyParent: fields.notifyParent.default(true),
  notes: fields.notes.default(''),
  dob: fields.dob.default(''),
  gender: fields.gender.default(''),
  joinedAt: fields.joinedAt,
  batchIds: fields.batchIds.default([]),
});

export const studentPatch = z
  .object({ ...fields })
  .omit({ joinedAt: true })
  .extend({ joinedAt: fields.joinedAt })
  .partial()
  .refine((p) => Object.keys(p).length > 0);

export const bulkInput = z.object({ students: z.array(studentInput).min(1).max(500) });

export const listQuery = z.object({
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  batchId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export type StudentInput = z.infer<typeof studentInput>;
