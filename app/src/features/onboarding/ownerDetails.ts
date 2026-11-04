import { z } from 'zod';

/**
 * The owner's basic details (decision 156): a contact email, where the centre is, and how they heard about Chalkpis.
 * Asked during sign-up, and once of every older centre (skippable; asked again after ASK_AGAIN_DAYS).
 * These lists match the server's (server/src/institutes/details.ts); a test checks that.
 */
export const HEARD_FROM = [
  'instagram',
  'youtube',
  'google',
  'store',
  'whatsapp',
  'friend',
  'team',
  'other',
] as const;
export type HeardFrom = (typeof HEARD_FROM)[number];

/** India's 28 states and 8 union territories. */
export const STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const;
export type State = (typeof STATES)[number];

/** Skipping the request ("Later") hides it for this long. */
export const ASK_AGAIN_DAYS = 3;
const DAY = 86_400_000;

// error messages are translation keys under `validation.*`
export const detailsSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254, 'tooLong').pipe(z.email('email')),
    city: z.string().trim().min(2, 'required').max(80, 'tooLong'),
    state: z.enum(STATES, { error: 'state' }),
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'pincode'),
    heardFrom: z.enum(HEARD_FROM, { error: 'heardFrom' }),
    heardFromOther: z.string().trim().max(120, 'tooLong'),
  })
  .refine((v) => v.heardFrom !== 'other' || v.heardFromOther.length >= 2, {
    path: ['heardFromOther'],
    message: 'heardFromOther',
  });
export type DetailsInput = z.input<typeof detailsSchema>;
export type Details = z.output<typeof detailsSchema>;

/** What the server keeps; "other" text is only sent with "Other". */
export function toPayload(d: Details) {
  return { ...d, heardFromOther: d.heardFrom === 'other' ? d.heardFromOther : '' };
}

/** States whose name contains the search, in the usual order. */
export function filterStates(query: string): State[] {
  const q = query.trim().toLowerCase();
  return q ? STATES.filter((s) => s.toLowerCase().includes(q)) : [...STATES];
}

/**
 * Whether to open the request on its own: an owner whose details are missing, and who has not tapped "Later" in the
 * last few days. A helper is never asked; an older server that does not say counts as done.
 */
export function shouldAsk(p: {
  role: 'owner' | 'staff' | undefined;
  detailsDone: boolean | undefined;
  laterUntil: number | null;
  now: number;
}): boolean {
  if (p.role !== 'owner' || p.detailsDone !== false) return false;
  return !p.laterUntil || p.now >= p.laterUntil;
}

/** When to ask again after "Later". */
export const laterUntil = (now: number) => now + ASK_AGAIN_DAYS * DAY;
