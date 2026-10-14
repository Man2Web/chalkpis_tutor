import { timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';
import { inTransaction, type Pool } from '../db.js';
import { hashOtp, newId, newOtp } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { normalizeIndianPhone } from '../lib/phone.js';
import type { MessageProvider } from '../messaging/provider.js';

export const OTP = { ttlMinutes: 5, cooldownSeconds: 60, maxPerHour: 5, maxAttempts: 5 } as const;

export interface OtpDeps {
  pool: Pool;
  config: Pick<Config, 'OTP_PEPPER' | 'WA_TEMPLATE_OTP'> &
    Partial<Pick<Config, 'REVIEW_PHONE' | 'REVIEW_CODE' | 'OTP_GLOBAL_PER_HOUR'>>;
  provider: MessageProvider | null;
  clock?: () => Date;
}

export type OtpRequestResult =
  | { ok: true; resendInSeconds: number; code: string } // `code` is for the caller to echo in development only
  | {
      ok: false;
      error: 'invalid_phone' | 'too_soon' | 'too_many' | 'unavailable';
      retryAfter?: number;
    };

const iso = (d: Date) => d;

/**
 * The store-review number (REVIEW_PHONE in config): it always signs in with its fixed code and no WhatsApp message
 * is sent. Store reviewers share the number, take their time and retry, so none of the per-number rules apply to it
 * (no expiry, no request needed first, no try or hourly limits).
 */
const isReview = (deps: OtpDeps, phone: string) =>
  !!deps.config.REVIEW_CODE &&
  !!deps.config.REVIEW_PHONE &&
  normalizeIndianPhone(deps.config.REVIEW_PHONE) === phone;

const sameCode = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Sends a login code. The answer is the same whether or not the number already has an account, so nobody can
 * use this to find out who is registered. At most one code per minute and five per hour per number.
 */
export async function requestOtp(deps: OtpDeps, rawPhone: unknown): Promise<OtpRequestResult> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) return { ok: false, error: 'invalid_phone' };
  if (isReview(deps, phone))
    return { ok: true, resendInSeconds: OTP.cooldownSeconds, code: deps.config.REVIEW_CODE! };
  if (!deps.provider || !deps.config.WA_TEMPLATE_OTP) return { ok: false, error: 'unavailable' };
  const now = (deps.clock ?? (() => new Date()))();
  const templateId = deps.config.WA_TEMPLATE_OTP;

  return withNamedLock(deps.pool, `otp:${phone}`, async (conn) => {
    const [recent] = (await conn.query(
      'SELECT created_at FROM otp_codes WHERE phone = ? AND created_at > ? ORDER BY created_at DESC',
      [phone, iso(new Date(now.getTime() - 3_600_000))],
    )) as unknown as [{ created_at: Date }[]];
    const last = recent[0]?.created_at;
    if (last) {
      const wait = OTP.cooldownSeconds - Math.floor((now.getTime() - last.getTime()) / 1000);
      if (wait > 0) return { ok: false, error: 'too_soon', retryAfter: wait } as const;
    }
    if (recent.length >= OTP.maxPerHour) {
      const oldest = recent[recent.length - 1]?.created_at ?? now;
      return {
        ok: false,
        error: 'too_many',
        retryAfter: Math.max(1, 3600 - Math.floor((now.getTime() - oldest.getTime()) / 1000)),
      } as const;
    }

    // The hourly cap across everyone stops code-pumping to random numbers. People who already have an account are
    // not counted against it, so a flood of strangers' numbers can never stop real users from signing in.
    const [known] = (await conn.query('SELECT 1 FROM users WHERE phone = ? LIMIT 1', [
      phone,
    ])) as unknown as [unknown[]];
    if (!known.length) {
      const [[all]] = (await conn.query(
        'SELECT COUNT(*) AS n FROM otp_codes WHERE created_at > ? AND phone NOT IN (SELECT phone FROM users WHERE phone IS NOT NULL)',
        [iso(new Date(now.getTime() - 3_600_000))],
      )) as unknown as [[{ n: number }]];
      if (Number(all?.n ?? 0) >= (deps.config.OTP_GLOBAL_PER_HOUR ?? 300))
        return { ok: false, error: 'too_many', retryAfter: 600 } as const;
    }

    const code = newOtp();
    const id = newId();
    await inTransaction(conn, async (c) => {
      await c.query(
        'UPDATE otp_codes SET consumed_at = ? WHERE phone = ? AND consumed_at IS NULL',
        [iso(now), phone],
      ); // only the newest code works
      await c.query(
        'INSERT INTO otp_codes (id, phone, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          id,
          phone,
          hashOtp(deps.config.OTP_PEPPER, phone, code),
          iso(new Date(now.getTime() + OTP.ttlMinutes * 60_000)),
          iso(now),
        ],
      );
    });

    const sent = await deps.provider!.send({
      to: phone,
      templateId: templateId!,
      vars: [code],
      reference: id,
      otp: true,
    });
    if (!sent.ok) {
      await conn.query('DELETE FROM otp_codes WHERE id = ?', [id]); // a code nobody received must not count against the limits
      return { ok: false, error: 'unavailable' } as const;
    }
    return { ok: true, resendInSeconds: OTP.cooldownSeconds, code } as const;
  });
}

export type OtpVerifyResult = { ok: true; userId: string; isNew: boolean } | { ok: false };

/**
 * Checks a login code. Wrong, expired, used, locked or never-sent all give the same answer.
 * Five wrong tries kill the code. A correct code works once; the account is created on first use.
 */
export async function verifyOtp(
  deps: OtpDeps,
  rawPhone: unknown,
  rawCode: unknown,
): Promise<OtpVerifyResult> {
  const r = await checkOtp(deps, rawPhone, rawCode, true);
  return r.ok ? { ok: true, userId: r.userId!, isNew: r.isNew } : { ok: false };
}

/**
 * Proves a signed-in person owns a number (adding a mobile to an account that has none): the same code rules,
 * but no account is created. `userId` is whoever already has that number, or null.
 */
export async function confirmPhoneOwnership(
  deps: OtpDeps,
  rawPhone: unknown,
  rawCode: unknown,
): Promise<{ ok: true; phone: string; userId: string | null } | { ok: false }> {
  const r = await checkOtp(deps, rawPhone, rawCode, false);
  return r.ok ? { ok: true, phone: r.phone, userId: r.userId } : { ok: false };
}

async function checkOtp(
  deps: OtpDeps,
  rawPhone: unknown,
  rawCode: unknown,
  createUser: boolean,
): Promise<{ ok: true; phone: string; userId: string | null; isNew: boolean } | { ok: false }> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone || typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode)) return { ok: false };
  const now = (deps.clock ?? (() => new Date()))();

  return withNamedLock(deps.pool, `otp:${phone}`, (conn) =>
    inTransaction(conn, async (c) => {
      if (isReview(deps, phone)) {
        // the fixed review code gets the same kind of guard as a real code: 10 wrong tries an hour lock it
        const [[failed]] = (await c.query(
          "SELECT COUNT(*) AS n FROM otp_codes WHERE phone = ? AND code_hash = 'review-miss' AND created_at > ?",
          [phone, iso(new Date(now.getTime() - 3_600_000))],
        )) as unknown as [[{ n: number }]];
        if (Number(failed?.n ?? 0) >= 10) return { ok: false } as const;
        if (!sameCode(rawCode, deps.config.REVIEW_CODE!)) {
          await c.query(
            "INSERT INTO otp_codes (id, phone, code_hash, expires_at, created_at, consumed_at) VALUES (?, ?, 'review-miss', ?, ?, ?)",
            [newId(), phone, iso(now), iso(now), iso(now)],
          );
          return { ok: false } as const;
        }
      } else {
        const [rows] = (await c.query(
          'SELECT id, code_hash, attempts FROM otp_codes WHERE phone = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
          [phone, iso(now)],
        )) as unknown as [{ id: string; code_hash: string; attempts: number }[]];
        const row = rows[0];
        if (!row || row.attempts >= OTP.maxAttempts) return { ok: false } as const;

        const given = Buffer.from(hashOtp(deps.config.OTP_PEPPER, phone, rawCode));
        const stored = Buffer.from(row.code_hash);
        if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
          await c.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
          return { ok: false } as const;
        }

        await c.query('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', [iso(now), row.id]);
      }
      const [users] = (await c.query('SELECT id FROM users WHERE phone = ?', [
        phone,
      ])) as unknown as [{ id: string }[]];
      if (users[0]) return { ok: true, phone, userId: users[0].id, isNew: false } as const;
      if (!createUser) return { ok: true, phone, userId: null, isNew: false } as const;
      const id = newId();
      await c.query('INSERT INTO users (id, phone) VALUES (?, ?)', [id, phone]);
      return { ok: true, phone, userId: id, isNew: true } as const;
    }),
  );
}
