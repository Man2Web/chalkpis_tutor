import { z } from 'zod';
import { parseRupeesToPaise } from '../../lib/money';
import { WEEKDAYS } from '../../lib/types';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time');

export const batchSchema = z
  .object({
    name: z.string().trim().min(2, 'required').max(60),
    subject: z.string().trim().min(1, 'required').max(60),
    class: z.string().trim().min(1, 'required').max(30),
    days: z.array(z.enum(WEEKDAYS as [string, ...string[]])).min(1, 'days'),
    startTime: time,
    endTime: time,
    defaultFee: z.string().refine((v) => parseRupeesToPaise(v) !== null, 'amount'),
  })
  .refine((b) => b.endTime > b.startTime, { path: ['endTime'], message: 'endAfterStart' });

export type BatchForm = z.infer<typeof batchSchema>;
