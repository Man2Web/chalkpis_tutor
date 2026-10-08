import { z } from 'zod';
import { ymd } from '../fees/schema.js';

export const saveDayInput = z
  .object({
    batchId: z.string().uuid(),
    date: ymd,
    marks: z.record(z.string().uuid(), z.enum(['P', 'A', 'L'])).default({}),
    holiday: z.enum(['holiday', 'cancelled']).optional(),
  })
  .refine((d) => Object.keys(d.marks).length <= 500, { path: ['marks'] });

export const dayQuery = z.object({ batchId: z.string().uuid(), date: ymd });
