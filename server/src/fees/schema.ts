import { z } from 'zod';
import { isRealDate } from '../lib/ist.js';

export const ymd = z.string().refine(isRealDate, { message: 'date' });
export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const money = z.number().int().min(1).max(100_000_000);

export const paymentInput = z.object({
  amount: money,
  mode: z.enum(['cash', 'upi', 'bank', 'other']),
  paidOn: ymd.optional(),
  note: z.string().trim().max(200).default(''),
});

export const chargeInput = z.object({
  studentId: z.string().uuid(),
  description: z.string().trim().min(1).max(120),
  amount: money,
  dueDate: ymd,
});

export const discountInput = z.object({ discount: z.number().int().min(0).max(100_000_000) });
export const waiveInput = z.object({
  waived: z.boolean(),
  note: z.string().trim().max(200).default(''),
});
export const generateInput = z.object({ period: period.optional() });

export const duesQuery = z.object({
  studentId: z.string().uuid().optional(),
  period: period.optional(),
  status: z.enum(['open', 'all']).default('open'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const paymentsQuery = z.object({
  studentId: z.string().uuid().optional(),
  from: ymd.optional(),
  to: ymd.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export const rangeQuery = z
  .object({
    from: ymd,
    to: ymd,
    batchId: z.string().uuid().optional(),
    studentId: z.string().uuid().optional(),
  })
  .refine((q) => q.to >= q.from, { path: ['to'] });
