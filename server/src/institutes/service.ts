import { withTransaction, type Pool } from '../db.js';
import { newId } from '../lib/ids.js';
import { queueCentreWelcome } from '../messaging/centreMessages.js';
import type { Category } from './category.js';

export const TRIAL_DAYS = 7;

export interface CreateInstituteInput {
  tutorName: string;
  instituteName: string;
  /** What the centre teaches; tuition when not given. */
  category?: Category;
  language: 'en' | 'hi';
}

/** A centre set up on the website rather than in the app (decision 147). */
export interface WebSignup {
  /** The phone the owner will use the app on. */
  phone: 'android' | 'ios';
  /** The ad campaign that brought them (a utm_* query string), or ''. */
  source: string;
  /** The free trial starts at the owner's first sign-in in the app (an iPhone owner, before the iPhone app is out). */
  trialOnFirstAppUse: boolean;
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
  web?: WebSignup,
) {
  return withTransaction(pool, async (c) => {
    // the user's own row is locked first: a double tap's two requests then run one after the other, and the
    // second finds the institute the first made (a missing membership row could not be locked)
    await c.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
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
      `INSERT INTO institutes (id, name, category, owner_user_id, phone, signup_channel, signup_phone, signup_source,
         trial_on_first_app_use, first_app_sign_in_at)
       SELECT ?, ?, ?, id, COALESCE(phone, ''), ?, ?, ?, ?, ? FROM users WHERE id = ?`,
      [
        instituteId,
        input.instituteName,
        input.category ?? 'tuition',
        web ? 'web' : 'app',
        web?.phone ?? null,
        web ? web.source.slice(0, 400) : null,
        web?.trialOnFirstAppUse ? 1 : 0,
        // set up in the app: that was the first sign-in there
        web ? null : now,
        userId,
      ],
    );
    await c.query("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'owner')", [
      userId,
      instituteId,
    ]);
    await c.query(
      "INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at) VALUES (?, 'trial', 'active', ?, ?)",
      [instituteId, now, new Date(now.getTime() + trialDays * 86_400_000)],
    );
    // the owner's WhatsApp welcome, sent by the worker once this commits
    await queueCentreWelcome(c, instituteId, now, trialDays);
    return { instituteId, created: true };
  });
}

/**
 * The owner signed in in the app. The first time for a centre set up on the website: its waiting free trial starts now,
 * at full length (a paid plan is left alone), and the date is kept (how many web sign-ups went on to use the app).
 */
export async function noteAppSignIn(
  pool: Pool,
  userId: string,
  now: Date = new Date(),
  trialDays: number = TRIAL_DAYS,
): Promise<number> {
  return withTransaction(pool, async (c) => {
    const [rows] = (await c.query(
      'SELECT id, trial_on_first_app_use AS waits FROM institutes WHERE owner_user_id = ? AND first_app_sign_in_at IS NULL FOR UPDATE',
      [userId],
    )) as unknown as [{ id: string; waits: number }[]];
    for (const r of rows) {
      if (r.waits)
        await c.query(
          "UPDATE subscriptions SET status = 'active', starts_at = ?, expires_at = ? WHERE institute_id = ? AND plan = 'trial'",
          [now, new Date(now.getTime() + trialDays * 86_400_000), r.id],
        );
      await c.query(
        'UPDATE institutes SET first_app_sign_in_at = ?, trial_on_first_app_use = 0 WHERE id = ?',
        [now, r.id],
      );
    }
    return rows.length;
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
