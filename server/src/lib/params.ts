import { z } from 'zod';
import { badRequest } from '../errors.js';

export const uuid = z.string().uuid();

/** Reads an id from the URL. Anything that is not a UUID is a plain 404-style miss, never reaches SQL. */
export function idParam(value: unknown): string {
  const r = uuid.safeParse(value);
  if (!r.success) throw badRequest('bad_id');
  return r.data;
}

/** Parses a request body or query with a zod schema; failure is a 400 without echoing the input. */
export function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success)
    throw badRequest('bad_request', {
      fields: [...new Set(r.error.issues.map((i) => i.path.join('.') || '(body)'))],
    });
  return r.data;
}
