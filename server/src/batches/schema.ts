import { z } from 'zod';

export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const batchInput = z
  .object({
    name: z.string().trim().min(2).max(60),
    subject: z.string().trim().min(1).max(60),
    class: z.string().trim().max(30).default(''),
    days: z.array(z.enum(DAYS)).min(1).max(7),
    startTime: time,
    endTime: time,
    defaultFee: z.number().int().min(0).max(100_000_000),
  })
  .refine((b) => b.endTime > b.startTime, { path: ['endTime'] });

export const batchPatch = z
  .object({
    name: z.string().trim().min(2).max(60),
    subject: z.string().trim().min(1).max(60),
    class: z.string().trim().max(30),
    days: z.array(z.enum(DAYS)).min(1).max(7),
    startTime: time,
    endTime: time,
    defaultFee: z.number().int().min(0).max(100_000_000),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);

export const studentIds = z.object({ studentIds: z.array(z.string().uuid()).min(1).max(200) });
