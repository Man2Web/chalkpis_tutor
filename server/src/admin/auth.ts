import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Config } from '../config.js';
import type { Pool } from '../db.js';
import type { Mail, Mailer } from '../auth/mailer.js';
import { hashOtp, newId, newOtp, sha256 } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';

/**
 * Admin dashboard sign-in, kept apart from the tutor app's: email + password, then a 6-digit code emailed for
 * that very attempt, then a short session. Who is an admin is only the ADMIN_EMAILS setting.
 *
 * - Passwords: scrypt (N=2^15, r=8, p=1) with a random salt, over an HMAC of the password keyed with a server
 *   secret (pepper), so a copy of the database alone cannot be attacked offline.
 * - Every wrong answer looks the same (no telling whether an email is an admin), takes about as long, and five
 *   wrong passwords lock the account for 15 minutes (the admin is emailed).
 * - The code is bound to the attempt that passed the password; codes last 10 minutes and allow 5 tries.
 * - Sessions: a random token (only its hash is stored), 8 hours at most, ended after 30 idle minutes, and all
 *   ended by a password reset.
 */

export const ADMIN_LIMITS = {
  lockAfter: 5,
  lockMinutes: 15,
  codeMinutes: 10,
  codeAttempts: 5,
  sessionHours: 8,
  idleMinutes: 30,
  resetPerHour: 5,
  resetCooldownSeconds: 60,
} as const;

export interface AdminAuthDeps {
  pool: Pool;
  mailer: Mailer | null;
  config: Pick<Config, 'JWT_SECRET' | 'OTP_PEPPER' | 'ADMIN_EMAILS' | 'NODE_ENV' | 'OTP_DEV_ECHO'>;
  clock?: () => Date;
}
export interface RequestMeta {
  ip: string;
  userAgent: string;
}

const scrypt = promisify(scryptCb) as (
  password: Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const now = (d: AdminAuthDeps) => (d.clock ?? (() => new Date()))();
const pepper = (secret: string, password: string) =>
  createHmac('sha256', `admin-password:${secret}`).update(password, 'utf8').digest();

export async function hashPassword(secret: string, password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pepper(secret, password), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(secret: string, stored: string, password: string) {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(
    pepper(secret, password),
    Buffer.from(salt, 'base64url'),
    expected.length,
    {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    },
  );
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// Spent on a wrong email too, so the time taken does not tell an admin email from any other.
let dummyHash: Promise<string> | null = null;
const dummy = (secret: string) =>
  (dummyHash ??= hashPassword(secret, randomBytes(16).toString('hex')));

const COMMON = [
  'password',
  'admin',
  'qwerty',
  'letmein',
  'welcome',
  'chalkpis',
  '123456',
  'iloveyou',
  'abc123',
];
/** Why a new password is not good enough, or null. At least 12 characters with upper, lower, digit and symbol. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 12) return 'too_short';
  if (password.length > 128) return 'too_long';
  if (
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  )
    return 'needs_mix';
  const lower = password.toLowerCase();
  const local = email.split('@')[0] ?? '';
  if (COMMON.some((c) => lower === c || lower.replace(/[^a-z]/g, '') === c)) return 'too_common';
  if (local.length >= 4 && lower.includes(local.toLowerCase())) return 'contains_email';
  return null;
}

/** Makes sure every ADMIN_EMAILS address has an account row (without a password until it is set). */
export async function ensureAdmins(pool: Pool, emails: string[]) {
  for (const email of emails)
    await pool.query('INSERT IGNORE INTO admin_accounts (id, email) VALUES (?, ?)', [
      newId(),
      email,
    ]);
}

interface AccountRow {
  id: string;
  email: string;
  password_hash: string | null;
  failed_attempts: number;
  locked_until: Date | null;
}
async function account(d: AdminAuthDeps, email: string): Promise<AccountRow | null> {
  const e = email.trim().toLowerCase();
  if (!d.config.ADMIN_EMAILS.includes(e)) return null; // removed from the setting: no access at all
  const [rows] = (await d.pool.query(
    'SELECT id, email, password_hash, failed_attempts, locked_until FROM admin_accounts WHERE email = ?',
    [e],
  )) as unknown as [AccountRow[]];
  return rows[0] ?? null;
}

async function audit(
  d: AdminAuthDeps,
  adminId: string | null,
  email: string,
  action: string,
  detail = '',
) {
  await d.pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), adminId, email.slice(0, 254), action, detail.slice(0, 300), now(d)],
  );
}

const echo = (d: AdminAuthDeps, code: string) =>
  d.config.OTP_DEV_ECHO && d.config.NODE_ENV !== 'production' ? { devCode: code } : {};

function mail(to: string, subject: string, lines: string[], code?: string): Mail {
  const text = [...lines, '', 'Chalkpis Admin · M2W Technologies Private Limited'].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:440px;margin:auto;padding:24px;color:#262626">
${code ? `<p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>` : ''}
${lines.map((l) => `<p style="font-size:14px;line-height:1.5">${l.replace(/[<>&]/g, '')}</p>`).join('')}
<p style="font-size:12px;color:#a3a3a3;margin-top:24px">Chalkpis Admin · M2W Technologies Private Limited</p></div>`;
  return { to, subject, text, html };
}
const when = (t: Date) => t.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

async function newCode(
  d: AdminAuthDeps,
  adminId: string,
  purpose: 'login' | 'reset',
  challengeHash: string | null,
) {
  const code = newOtp();
  await d.pool.query(
    'UPDATE admin_codes SET consumed_at = ? WHERE admin_id = ? AND purpose = ? AND consumed_at IS NULL',
    [now(d), adminId, purpose],
  );
  await d.pool.query(
    'INSERT INTO admin_codes (id, admin_id, purpose, code_hash, challenge_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      newId(),
      adminId,
      purpose,
      hashOtp(d.config.OTP_PEPPER, `admin-${purpose}:${adminId}`, code),
      challengeHash,
      new Date(now(d).getTime() + ADMIN_LIMITS.codeMinutes * 60_000),
      now(d),
    ],
  );
  return code;
}

/** Checks a code; wrong, expired, used or out of tries all give false. A right code works once. */
async function useCode(
  d: AdminAuthDeps,
  adminId: string,
  purpose: 'login' | 'reset',
  code: unknown,
  challengeHash: string | null,
): Promise<boolean> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  return withNamedLock(d.pool, `admincode:${adminId}:${purpose}`, async (c) => {
    const [rows] = (await c.query(
      `SELECT id, code_hash, challenge_hash, attempts FROM admin_codes
        WHERE admin_id = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1`,
      [adminId, purpose, now(d)],
    )) as unknown as [
      { id: string; code_hash: string; challenge_hash: string | null; attempts: number }[],
    ];
    const row = rows[0];
    if (!row || row.attempts >= ADMIN_LIMITS.codeAttempts) return false;
    if (challengeHash !== row.challenge_hash) return false;
    const given = Buffer.from(hashOtp(d.config.OTP_PEPPER, `admin-${purpose}:${adminId}`, code));
    const stored = Buffer.from(row.code_hash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      await c.query('UPDATE admin_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      return false;
    }
    await c.query('UPDATE admin_codes SET consumed_at = ? WHERE id = ?', [now(d), row.id]);
    return true;
  });
}

export type LoginResult =
  | { ok: true; challenge: string; devCode?: string }
  | { ok: false; error: 'invalid_credentials' | 'unavailable' };

/** Step 1: email and password. Success emails a code and returns the challenge the code is bound to. */
export async function adminLogin(
  d: AdminAuthDeps,
  email: unknown,
  password: unknown,
  meta: RequestMeta,
): Promise<LoginResult> {
  const bad = { ok: false, error: 'invalid_credentials' } as const;
  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    password.length > 128 ||
    email.length > 254
  )
    return bad;
  if (!d.mailer) return { ok: false, error: 'unavailable' };
  const a = await account(d, email);
  const t = now(d);
  // Wrong passwords lock that address out of this account, not the account itself: someone who knows the admin email
  // cannot keep the admin locked out from their own network. The password is still followed by an emailed code.
  const fails = async (minutes: number, actions: string[], ip?: string) => {
    const [[r]] = (await d.pool.query(
      `SELECT COUNT(*) AS n FROM admin_audit WHERE admin_user_id = ? AND action IN (?) AND created_at > ?${
        ip === undefined ? '' : ' AND detail = ?'
      }`,
      [
        a!.id,
        actions,
        new Date(t.getTime() - minutes * 60_000),
        ...(ip === undefined ? [] : [ip.slice(0, 300)]),
      ],
    )) as unknown as [[{ n: number }]];
    return Number(r?.n ?? 0);
  };
  const failedHere = a?.password_hash
    ? await fails(ADMIN_LIMITS.lockMinutes, ['admin-login-failed', 'admin-locked'], meta.ip ?? '')
    : 0;
  if (!a || !a.password_hash || failedHere >= ADMIN_LIMITS.lockAfter) {
    await verifyPassword(d.config.JWT_SECRET, await dummy(d.config.JWT_SECRET), password);
    if (a)
      await audit(
        d,
        a.id,
        a.email,
        'admin-login-refused',
        a.password_hash ? `locked ${meta.ip ?? ''}` : 'no password set',
      );
    return bad;
  }
  if (!(await verifyPassword(d.config.JWT_SECRET, a.password_hash, password))) {
    const lock = failedHere + 1 >= ADMIN_LIMITS.lockAfter;
    // one warning email an hour at most, however many addresses try
    const warned = lock ? await fails(60, ['admin-locked']) : 0;
    await audit(d, a.id, a.email, lock ? 'admin-locked' : 'admin-login-failed', meta.ip ?? '');
    if (lock && !warned)
      await d.mailer.send(
        mail(a.email, 'Wrong passwords for your Chalkpis admin account', [
          `${ADMIN_LIMITS.lockAfter} wrong passwords for your Chalkpis admin account from ${meta.ip || 'unknown'} (${when(t)}). That address is blocked for ${ADMIN_LIMITS.lockMinutes} minutes; you can still sign in from yours.`,
          'If this was not you, nobody got in (every sign-in also needs the emailed code), but reset your password if you think it is known.',
        ]),
      );
    return bad;
  }
  const challenge = randomBytes(32).toString('base64url');
  const code = await newCode(d, a.id, 'login', sha256(challenge));
  const sent = await d.mailer.send(
    mail(
      a.email,
      `${code} is your Chalkpis admin sign-in code`,
      [
        `Your Chalkpis admin sign-in code. It works for ${ADMIN_LIMITS.codeMinutes} minutes.`,
        `Requested from ${meta.ip || 'unknown'} at ${when(t)}. If this was not you, someone knows your password: reset it now.`,
      ],
      code,
    ),
  );
  if (!sent) return { ok: false, error: 'unavailable' };
  return { ok: true, challenge, ...echo(d, code) };
}

/** Step 2: the emailed code for that attempt. Success starts a session and returns its token (shown once). */
export async function adminVerify(
  d: AdminAuthDeps,
  email: unknown,
  challenge: unknown,
  code: unknown,
  meta: RequestMeta,
): Promise<{ token: string; email: string; expiresAt: string } | null> {
  if (typeof email !== 'string' || typeof challenge !== 'string' || challenge.length !== 43)
    return null;
  const a = await account(d, email);
  if (!a || !a.password_hash) return null;
  if (!(await useCode(d, a.id, 'login', code, sha256(challenge)))) {
    await audit(d, a.id, a.email, 'admin-code-failed', meta.ip);
    return null;
  }
  const t = now(d);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(t.getTime() + ADMIN_LIMITS.sessionHours * 3_600_000);
  await d.pool.query(
    'INSERT INTO admin_sessions (id, admin_id, token_hash, ip, user_agent, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      newId(),
      a.id,
      sha256(token),
      meta.ip.slice(0, 45),
      meta.userAgent.slice(0, 200),
      expiresAt,
      t,
      t,
    ],
  );
  await d.pool.query('UPDATE admin_accounts SET last_login_at = ? WHERE id = ?', [t, a.id]);
  await audit(d, a.id, a.email, 'admin-login', `${meta.ip} ${meta.userAgent}`.trim());
  return { token, email: a.email, expiresAt: expiresAt.toISOString() };
}

export interface AdminIdentity {
  adminId: string;
  email: string;
}
/** The admin behind a session token, or null (unknown, revoked, expired, idle too long, or no longer an admin). */
export async function adminSession(
  d: AdminAuthDeps,
  token: unknown,
): Promise<AdminIdentity | null> {
  if (typeof token !== 'string' || token.length !== 43) return null;
  const t = now(d);
  const [rows] = (await d.pool.query(
    `SELECT s.id, s.admin_id, s.expires_at, s.last_seen_at, a.email FROM admin_sessions s
       JOIN admin_accounts a ON a.id = s.admin_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
    [sha256(token)],
  )) as unknown as [
    { id: string; admin_id: string; expires_at: Date; last_seen_at: Date; email: string }[],
  ];
  const s = rows[0];
  if (!s || !d.config.ADMIN_EMAILS.includes(s.email)) return null;
  const idle = t.getTime() - s.last_seen_at.getTime() > ADMIN_LIMITS.idleMinutes * 60_000;
  if (s.expires_at <= t || idle) {
    await d.pool.query('UPDATE admin_sessions SET revoked_at = ? WHERE id = ?', [t, s.id]);
    return null;
  }
  await d.pool.query('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?', [t, s.id]);
  return { adminId: s.admin_id, email: s.email };
}

export async function adminLogout(d: AdminAuthDeps, token: unknown) {
  if (typeof token !== 'string') return;
  const [rows] = (await d.pool.query(
    `SELECT a.id, a.email FROM admin_sessions s JOIN admin_accounts a ON a.id = s.admin_id
      WHERE s.token_hash = ? AND s.revoked_at IS NULL`,
    [sha256(token)],
  )) as unknown as [{ id: string; email: string }[]];
  await d.pool.query(
    'UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
    [now(d), sha256(token)],
  );
  if (rows[0]) await audit(d, rows[0].id, rows[0].email, 'admin-logout');
}

/** Forgot password: emails a reset code if the address is an admin. The answer is the same either way. */
export async function adminForgot(d: AdminAuthDeps, email: unknown): Promise<{ devCode?: string }> {
  if (typeof email !== 'string' || !d.mailer) return {};
  const a = await account(d, email);
  if (!a) return {};
  const t = now(d);
  const [recent] = (await d.pool.query(
    "SELECT created_at FROM admin_codes WHERE admin_id = ? AND purpose = 'reset' AND created_at > ? ORDER BY created_at DESC",
    [a.id, new Date(t.getTime() - 3_600_000)],
  )) as unknown as [{ created_at: Date }[]];
  const last = recent[0]?.created_at;
  if (
    recent.length >= ADMIN_LIMITS.resetPerHour ||
    (last && t.getTime() - last.getTime() < ADMIN_LIMITS.resetCooldownSeconds * 1000)
  )
    return {};
  const code = await newCode(d, a.id, 'reset', null);
  await d.mailer.send(
    mail(
      a.email,
      `${code} is your Chalkpis admin password reset code`,
      [
        `Use this code to set a new Chalkpis admin password. It works for ${ADMIN_LIMITS.codeMinutes} minutes.`,
        'If you did not ask for it, ignore this email; your password stays the same.',
      ],
      code,
    ),
  );
  await audit(d, a.id, a.email, 'admin-reset-requested');
  return echo(d, code);
}

export type ResetResult = { ok: true } | { ok: false; error: 'invalid_code' | string };
/** Sets a new password with the emailed code; every open admin session of that account is ended. */
export async function adminReset(
  d: AdminAuthDeps,
  email: unknown,
  code: unknown,
  password: unknown,
): Promise<ResetResult> {
  if (typeof email !== 'string' || typeof password !== 'string')
    return { ok: false, error: 'invalid_code' };
  const a = await account(d, email);
  if (!a) return { ok: false, error: 'invalid_code' };
  const problem = passwordProblem(password, a.email);
  if (problem) return { ok: false, error: problem }; // checked first, so a weak choice does not use up the code
  if (!(await useCode(d, a.id, 'reset', code, null))) {
    await audit(d, a.id, a.email, 'admin-reset-failed');
    return { ok: false, error: 'invalid_code' };
  }
  const t = now(d);
  await d.pool.query(
    'UPDATE admin_accounts SET password_hash = ?, password_set_at = ?, failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [await hashPassword(d.config.JWT_SECRET, password), t, a.id],
  );
  await d.pool.query(
    'UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL',
    [t, a.id],
  );
  await audit(d, a.id, a.email, 'admin-password-reset');
  await d.mailer?.send(
    mail(a.email, 'Your Chalkpis admin password was changed', [
      `Your Chalkpis admin password was changed at ${when(t)} and every admin session was signed out.`,
      'If this was not you, reset it again now and tell your team.',
    ]),
  );
  return { ok: true };
}
