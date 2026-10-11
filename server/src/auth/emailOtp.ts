import { timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';
import { inTransaction, type Pool } from '../db.js';
import { hashOtp, newId, newOtp } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { normalizeEmail } from './identity.js';
import { codeMail, type Mailer } from './mailer.js';

/** Email codes last a little longer than WhatsApp ones (mail can be slow); the other limits are the same. */
export const EMAIL_OTP = {
  ttlMinutes: 10,
  cooldownSeconds: 60,
  maxPerHour: 5,
  maxAttempts: 5,
} as const;

export interface EmailOtpDeps {
  pool: Pool;
  config: Pick<Config, 'OTP_PEPPER'>;
  mailer: Mailer | null;
  clock?: () => Date;
}

const key = (email: string) => `email:${email}`;

export type EmailRequestResult =
  | { ok: true; resendInSeconds: number; code: string; email: string }
  | {
      ok: false;
      error: 'invalid_email' | 'too_soon' | 'too_many' | 'unavailable';
      retryAfter?: number;
    };

/**
 * Emails a sign-in code. The answer does not depend on whether the address has an account. At most one code a
 * minute and five an hour per address.
 */
export async function requestEmailCode(
  deps: EmailOtpDeps,
  raw: unknown,
): Promise<EmailRequestResult> {
  const email = normalizeEmail(raw);
  if (!email) return { ok: false, error: 'invalid_email' };
  if (!deps.mailer) return { ok: false, error: 'unavailable' };
  const now = (deps.clock ?? (() => new Date()))();
  return withNamedLock(deps.pool, `emailotp:${email}`, async (conn) => {
    const [recent] = (await conn.query(
      'SELECT created_at FROM email_codes WHERE email = ? AND created_at > ? ORDER BY created_at DESC',
      [email, new Date(now.getTime() - 3_600_000)],
    )) as unknown as [{ created_at: Date }[]];
    const last = recent[0]?.created_at;
    if (last) {
      const wait = EMAIL_OTP.cooldownSeconds - Math.floor((now.getTime() - last.getTime()) / 1000);
      if (wait > 0) return { ok: false, error: 'too_soon', retryAfter: wait } as const;
    }
    if (recent.length >= EMAIL_OTP.maxPerHour)
      return { ok: false, error: 'too_many', retryAfter: 3600 } as const;

    const code = newOtp();
    const id = newId();
    await inTransaction(conn, async (c) => {
      await c.query(
        'UPDATE email_codes SET consumed_at = ? WHERE email = ? AND consumed_at IS NULL',
        [now, email],
      );
      await c.query(
        'INSERT INTO email_codes (id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          id,
          email,
          hashOtp(deps.config.OTP_PEPPER, key(email), code),
          new Date(now.getTime() + EMAIL_OTP.ttlMinutes * 60_000),
          now,
        ],
      );
    });
    if (!(await deps.mailer!.send(codeMail(email, code)))) {
      await conn.query('DELETE FROM email_codes WHERE id = ?', [id]); // a code nobody received does not count
      return { ok: false, error: 'unavailable' } as const;
    }
    return { ok: true, resendInSeconds: EMAIL_OTP.cooldownSeconds, code, email } as const;
  });
}

/** Checks an email code: wrong, expired, used or locked all give null. A correct code works once. */
export async function verifyEmailCode(
  deps: EmailOtpDeps,
  raw: unknown,
  rawCode: unknown,
): Promise<string | null> {
  const email = normalizeEmail(raw);
  if (!email || typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode)) return null;
  const now = (deps.clock ?? (() => new Date()))();
  return withNamedLock(deps.pool, `emailotp:${email}`, (conn) =>
    inTransaction(conn, async (c) => {
      const [rows] = (await c.query(
        'SELECT id, code_hash, attempts FROM email_codes WHERE email = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
        [email, now],
      )) as unknown as [{ id: string; code_hash: string; attempts: number }[]];
      const row = rows[0];
      if (!row || row.attempts >= EMAIL_OTP.maxAttempts) return null;
      const given = Buffer.from(hashOtp(deps.config.OTP_PEPPER, key(email), rawCode));
      const stored = Buffer.from(row.code_hash);
      if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
        await c.query('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
        return null;
      }
      await c.query('UPDATE email_codes SET consumed_at = ? WHERE id = ?', [now, row.id]);
      return email;
    }),
  );
}
