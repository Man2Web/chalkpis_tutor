import { withTransaction, type Pool } from '../db.js';
import { TRIAL_LIMITS } from '../billing/plans.js';
import { hashTrialPhone, newId } from '../lib/ids.js';
import { queueCentreWelcome } from '../messaging/centreMessages.js';
import type { Category } from './category.js';
import type { OwnerDetails } from './details.js';

export const TRIAL_DAYS = 7;

export interface CreateInstituteInput {
  tutorName: string;
  instituteName: string;
  /** What the centre teaches; tuition when not given. */
  category?: Category;
  language: 'en' | 'hi';
  /** The owner's basic details, when the sign-up form asked for them (the website does; the app asks next). */
  details?: OwnerDetails;
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
 * First-time setup for a signed-in user: their profile, a new institute with them as owner, and a 7-day trial
 * (up to 100 students), all or nothing. Calling it again returns the existing institute and changes nothing.
 * One free trial per mobile number: with `trialPepper` (the server's OTP_PEPPER) the number is noted in used_trials
 * (keyed hash only), and a number that already had a trial (an owner who deleted their account and signed up again)
 * gets the centre with its plan already ended, so it subscribes to go on.
 */
export async function createInstitute(
  pool: Pool,
  userId: string,
  input: CreateInstituteInput,
  now: Date = new Date(),
  trialDays: number = TRIAL_DAYS,
  web?: WebSignup,
  trialPepper?: string,
) {
  return withTransaction(pool, async (c) => {
    // the user's own row is locked first: a double tap's two requests then run one after the other, and the
    // second finds the institute the first made (a missing membership row could not be locked)
    const [me] = (await c.query('SELECT phone FROM users WHERE id = ? FOR UPDATE', [
      userId,
    ])) as unknown as [{ phone: string | null }[]];
    const [existing] = (await c.query(
      'SELECT institute_id FROM memberships WHERE user_id = ? FOR UPDATE',
      [userId],
    )) as unknown as [{ institute_id: string }[]];
    if (existing[0]) return { instituteId: existing[0].institute_id, created: false, trialUsed: false };

    const phoneHash = trialPepper && me[0]?.phone ? hashTrialPhone(trialPepper, me[0].phone) : null;
    let trialUsed = false;
    if (phoneHash) {
      const [used] = (await c.query('SELECT 1 FROM used_trials WHERE phone_hash = ?', [
        phoneHash,
      ])) as unknown as [unknown[]];
      trialUsed = used.length > 0;
      if (!trialUsed)
        await c.query('INSERT IGNORE INTO used_trials (phone_hash, created_at) VALUES (?, ?)', [
          phoneHash,
          now,
        ]);
    }

    const instituteId = newId();
    await c.query('UPDATE users SET name = ?, language = ? WHERE id = ?', [
      input.tutorName,
      input.language,
      userId,
    ]);
    const d = input.details;
    await c.query(
      `INSERT INTO institutes (id, name, category, owner_user_id, phone, signup_channel, signup_phone, signup_source,
         trial_on_first_app_use, first_app_sign_in_at, contact_email, city, state, pincode, heard_from, heard_from_other,
         details_at)
       SELECT ?, ?, ?, id, COALESCE(phone, ''), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM users WHERE id = ?`,
      [
        instituteId,
        input.instituteName,
        input.category ?? 'tuition',
        web ? 'web' : 'app',
        web?.phone ?? null,
        web ? web.source.slice(0, 400) : null,
        web?.trialOnFirstAppUse && !trialUsed ? 1 : 0,
        // set up in the app: that was the first sign-in there
        web ? null : now,
        d?.email ?? null,
        d?.city ?? null,
        d?.state ?? null,
        d?.pincode ?? null,
        d?.heardFrom ?? null,
        d?.heardFrom === 'other' ? d.heardFromOther : null,
        d ? now : null,
        userId,
      ],
    );
    await c.query("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'owner')", [
      userId,
      instituteId,
    ]);
    await c.query(
      `INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at, student_limit, batch_limit)
       VALUES (?, 'trial', ?, ?, ?, ?, ?)`,
      [
        instituteId,
        trialUsed ? 'expired' : 'active',
        now,
        trialUsed ? now : new Date(now.getTime() + trialDays * 86_400_000),
        TRIAL_LIMITS.studentLimit,
        TRIAL_LIMITS.batchLimit,
      ],
    );
    // the owner's WhatsApp welcome (it promises the free days), sent by the worker once this commits
    if (!trialUsed) await queueCentreWelcome(c, instituteId, now, trialDays);
    return { instituteId, created: true, trialUsed };
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
