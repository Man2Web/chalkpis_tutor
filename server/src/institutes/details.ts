import { z } from 'zod';
import type { Pool } from '../db.js';

/**
 * The owner's basic details (decision 156): a contact email, where the centre is, and how they heard about Chalkpis.
 * The app keeps its own copy of these lists (app/src/features/onboarding/ownerDetails.ts); a test checks they match.
 */
export const HEARD_FROM = [
  'instagram', // Instagram or Facebook
  'youtube',
  'google', // Google search
  'store', // Play Store or App Store
  'whatsapp',
  'friend', // a friend or another teacher
  'team', // someone from Chalkpis
  'other',
] as const;
export type HeardFrom = (typeof HEARD_FROM)[number];

/** India's 28 states and 8 union territories, as people write them. */
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

export const ownerDetailsBody = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    city: z.string().trim().min(2).max(80),
    state: z.enum(STATES),
    // six digits, never starting with 0
    pincode: z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/),
    heardFrom: z.enum(HEARD_FROM),
    // what "Other" was; ignored for the rest
    heardFromOther: z.string().trim().max(120).default(''),
  })
  .refine((v) => v.heardFrom !== 'other' || v.heardFromOther.length >= 2, {
    path: ['heardFromOther'],
  });
export type OwnerDetails = z.infer<typeof ownerDetailsBody>;

/** Saves the owner's details on the centre and marks them done. Allowed even when the plan has ended. */
export async function saveOwnerDetails(
  pool: Pool,
  instituteId: string,
  d: OwnerDetails,
  now: Date = new Date(),
) {
  await pool.query(
    `UPDATE institutes SET contact_email = ?, city = ?, state = ?, pincode = ?, heard_from = ?, heard_from_other = ?,
       details_at = ? WHERE id = ?`,
    [
      d.email,
      d.city,
      d.state,
      d.pincode,
      d.heardFrom,
      d.heardFrom === 'other' ? d.heardFromOther : null,
      now,
      instituteId,
    ],
  );
}

export interface DetailsRow {
  contact_email: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  heard_from: string | null;
  heard_from_other: string | null;
  details_at: Date | null;
}

/** The details as the app and the admin dashboard read them; null before the owner has filled them in. */
export function toOwnerDetails(r: DetailsRow) {
  if (!r.details_at) return null;
  return {
    email: r.contact_email ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    pincode: r.pincode ?? '',
    heardFrom: r.heard_from ?? '',
    heardFromOther: r.heard_from_other ?? '',
    at: r.details_at.toISOString(),
  };
}

/** How each answer reads on the website sign-up form and in the admin dashboard. */
export const HEARD_FROM_LABEL: Record<HeardFrom, string> = {
  instagram: 'Instagram or Facebook',
  youtube: 'YouTube',
  google: 'Google search',
  store: 'Play Store or App Store',
  whatsapp: 'WhatsApp',
  friend: 'A friend or another teacher',
  team: 'Someone from Chalkpis',
  other: 'Other',
};
