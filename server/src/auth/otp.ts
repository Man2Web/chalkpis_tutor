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
  config: Pick<Config, 'OTP_PEPPER' | 'WA_TEMPLATE_OTP'>;
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
 * Sends a login code. The answer is the same whether or not the number already has an account, so nobody can
 * use this to find out who is registered. At most one code per minute and five per hour per number.
 */
export async function requestOtp(deps: OtpDeps, rawPhone: unknown): Promise<OtpRequestResult> {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) return { ok: false, error: 'invalid_phone' };
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
      templateId,
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
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone || typeof rawCode !== 'string' || !/^\d{6}$/.test(rawCode)) return { ok: false };
  const now = (deps.clock ?? (() => new Date()))();

  return withNamedLock(deps.pool, `otp:${phone}`, (conn) =>
    inTransaction(conn, async (c) => {
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
      const [users] = (await c.query('SELECT id FROM users WHERE phone = ?', [
        phone,
      ])) as unknown as [{ id: string }[]];
      if (users[0]) return { ok: true, userId: users[0].id, isNew: false } as const;
      const id = newId();
      await c.query('INSERT INTO users (id, phone) VALUES (?, ?)', [id, phone]);
      return { ok: true, userId: id, isNew: true } as const;
    }),
  );
}
