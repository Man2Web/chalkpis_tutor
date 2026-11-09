import { timingSafeEqual } from 'node:crypto';
import type { Config } from '../config.js';
import { inTransaction, type Pool, type PoolConnection } from '../db.js';
import { hashOtp, newId, newOtp } from '../lib/ids.js';
import { addressKey } from '../lib/ip.js';
import { withNamedLock } from '../lib/lock.js';
import { normalizeIndianPhone } from '../lib/phone.js';
import { meterLoginCode } from '../messaging/meter.js';
import type { MessageProvider } from '../messaging/provider.js';

/**
 * maxFailedPerDay: wrong codes one number may get in 24 hours, across all its codes. The hourly rules alone allow
 * about 25 guesses an hour (600 a day); this keeps a patient guesser on a registered number to 1 in 50,000 a day.
 */
export const OTP = {
  ttlMinutes: 5,
  cooldownSeconds: 60,
  maxPerHour: 5,
  maxAttempts: 5,
  maxFailedPerDay: 20,
} as const;

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

/** SQL on `users u`: someone who has signed in, or anyone who is not just a helper an owner added (never signed in). */
const KNOWN_USER = `(u.last_login_at IS NOT NULL OR NOT EXISTS (
  SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.role = 'staff'))`;

/**
 * Rate-limit groups shared by every route that sends or checks a login code (the app, adding a number, the /plan
 * billing page), so each address gets one allowance in all, not one per door (hardening, 9 Nov 2026).
 */
export const OTP_REQUEST = 'otp-request';
export const OTP_VERIFY = 'otp-verify';

/** New-number codes one address may ask for per hour (IPv6 counted per /64, the usual size of one customer's block). */
const NEW_NUMBERS_PER_IP_HOUR = 10;
const newNumberSlots = new Map<string, number[]>();
// a real /64 even for shortened forms (2001:db8::1 and 2001:db8:0:0:ffff::2 are one network)
const ipKey = (ip: string) => addressKey(ip);
function takeNewNumberSlot(ip: string, now: Date) {
  const key = ipKey(ip);
  const since = now.getTime() - 3_600_000;
  const times = (newNumberSlots.get(key) ?? []).filter((t) => t > since && t <= now.getTime());
  if (times.length >= NEW_NUMBERS_PER_IP_HOUR) return false;
  times.push(now.getTime());
  newNumberSlots.set(key, times);
  if (newNumberSlots.size > 20_000) newNumberSlots.clear();
  return true;
}
/**
 * Wrong store-review codes one address may try per hour. The review number itself is never locked (reviewers share
 * it and must always get in), so guessing its code is limited per address instead.
 */
const REVIEW_MISSES_PER_IP_HOUR = 10;
const reviewMisses = new Map<string, number[]>();
const recentReviewMisses = (ip: string, now: Date) =>
  (reviewMisses.get(ipKey(ip)) ?? []).filter(
    (t) => t > now.getTime() - 3_600_000 && t <= now.getTime(),
  );
function noteReviewMiss(ip: string, now: Date) {
  const times = recentReviewMisses(ip, now);
  times.push(now.getTime());
  reviewMisses.set(ipKey(ip), times);
  if (reviewMisses.size > 20_000) reviewMisses.clear();
}

/** Tests: forget the per-address counts. */
export const resetNewNumberSlots = () => {
  newNumberSlots.clear();
  reviewMisses.clear();
};

/** Wrong codes this number got in the last 24 hours (all its codes; rows live a day past expiry, see the cleanup job). */
async function failedToday(db: Pool | PoolConnection, phone: string, now: Date): Promise<number> {
  const [[r]] = (await db.query(
    'SELECT COALESCE(SUM(attempts), 0) AS n FROM otp_codes WHERE phone = ? AND created_at > ?',
    [phone, new Date(now.getTime() - 86_400_000)],
  )) as unknown as [[{ n: number | string }]];
  return Number(r?.n ?? 0);
}

/**
 * Sends a login code. The answer is the same whether or not the number already has an account, so nobody can
 * use this to find out who is registered. At most one code per minute and five per hour per number.
 */
export async function requestOtp(
  deps: OtpDeps,
  rawPhone: unknown,
  ip?: string,
): Promise<OtpRequestResult> {
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
    // too many wrong codes today: no new code until tomorrow (a code that could not be used would only mislead)
    if ((await failedToday(conn, phone, now)) >= OTP.maxFailedPerDay)
      return { ok: false, error: 'too_many', retryAfter: 6 * 3600 } as const;

    // The hourly cap across everyone stops code-pumping to random numbers. People who already have an account are
    // not counted against it, so a flood of strangers' numbers can never stop real users from signing in. A helper an
    // owner added who has never signed in is not "known" yet: otherwise adding numbers as helpers would lift them out
    // of the cap. And one address may ask for only a few new numbers an hour, so it cannot use up the cap for
    // everyone else on its own.
    const [known] = (await conn.query(
      `SELECT 1 FROM users u WHERE u.phone = ? AND ${KNOWN_USER} LIMIT 1`,
      [phone],
    )) as unknown as [unknown[]];
    if (!known.length) {
      if (ip && !takeNewNumberSlot(ip, now))
        return { ok: false, error: 'too_many', retryAfter: 600 } as const;
      const [[all]] = (await conn.query(
        `SELECT COUNT(*) AS n FROM otp_codes o WHERE o.created_at > ?
           AND NOT EXISTS (SELECT 1 FROM users u WHERE u.phone = o.phone AND ${KNOWN_USER})`,
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
    await meterLoginCode(deps.pool, now, phone);
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
  ip?: string,
): Promise<OtpVerifyResult> {
  const r = await checkOtp(deps, rawPhone, rawCode, true, ip);
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
  ip?: string,
): Promise<{ ok: true; phone: string; userId: string | null } | { ok: false }> {
  const r = await checkOtp(deps, rawPhone, rawCode, false, ip);
  return r.ok ? { ok: true, phone: r.phone, userId: r.userId } : { ok: false };
}

async function checkOtp(
  deps: OtpDeps,
  rawPhone: unknown,
  rawCode: unknown,
  createUser: boolean,
  ip?: string,
): Promise<{ ok: true; phone: string; userId: string | null; isNew: boolean } | { ok: false }> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone || typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode)) return { ok: false };
  const now = (deps.clock ?? (() => new Date()))();

  return withNamedLock(deps.pool, `otp:${phone}`, (conn) =>
    inTransaction(conn, async (c) => {
      if (isReview(deps, phone)) {
        // The review number is never locked (decided 9 Nov 2026): wrong guesses from one address could otherwise
        // shut the store reviewers out. Instead one address gets 10 wrong tries an hour; a reviewer elsewhere is
        // not affected.
        if (ip && recentReviewMisses(ip, now).length >= REVIEW_MISSES_PER_IP_HOUR)
          return { ok: false } as const;
        if (!sameCode(rawCode, deps.config.REVIEW_CODE!)) {
          if (ip) noteReviewMiss(ip, now);
          return { ok: false } as const;
        }
      } else {
        if ((await failedToday(c, phone, now)) >= OTP.maxFailedPerDay)
          return { ok: false } as const;
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
