import { withTransaction, type Pool } from '../db.js';
import { newId } from '../lib/ids.js';

export const TRIAL_DAYS = 7;

export interface CreateInstituteInput {
  tutorName: string;
  instituteName: string;
  language: 'en' | 'hi';
}

/**
 * First-time setup for a signed-in user: their profile, a new institute with them as owner, and a 7-day trial,
 * all or nothing. Calling it again returns the existing institute and changes nothing.
 */
export async function createInstitute(
  pool: Pool,
  userId: string,
  input: CreateInstituteInput,
  now: Date = new Date(),
  trialDays: number = TRIAL_DAYS,
) {
  return withTransaction(pool, async (c) => {
    const [existing] = (await c.query(
      'SELECT institute_id FROM memberships WHERE user_id = ? FOR UPDATE',
      [userId],
    )) as unknown as [{ institute_id: string }[]];
    if (existing[0]) return { instituteId: existing[0].institute_id, created: false };

    const instituteId = newId();
    await c.query('UPDATE users SET name = ?, language = ? WHERE id = ?', [
      input.tutorName,
      input.language,
      userId,
    ]);
    await c.query(
      'INSERT INTO institutes (id, name, owner_user_id, phone) SELECT ?, ?, id, phone FROM users WHERE id = ?',
      [instituteId, input.instituteName, userId],
    );
    await c.query("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'owner')", [
      userId,
      instituteId,
    ]);
    await c.query(
      "INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at) VALUES (?, 'trial', 'active', ?, ?)",
      [instituteId, now, new Date(now.getTime() + trialDays * 86_400_000)],
    );
    return { instituteId, created: true };
  });
}

/** True while the institute's plan is active and not past its end date. Writes are refused when false (read-only mode). */
export async function isPlanActive(
  pool: Pool,
  instituteId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [rows] = (await pool.query(
    "SELECT 1 AS ok FROM subscriptions WHERE institute_id = ? AND status = 'active' AND expires_at > ?",
    [instituteId, now],
  )) as unknown as [unknown[]];
  return rows.length > 0;
}
