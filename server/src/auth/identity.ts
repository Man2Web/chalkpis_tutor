import { createHash, randomBytes } from 'node:crypto';
import type { Pool, PoolConnection } from '../db.js';
import { newId } from '../lib/ids.js';

/** A way someone proved who they are, other than the WhatsApp code: Google, Apple or an email code. */
export interface Identity {
  provider: 'google' | 'apple' | 'email';
  /** The provider's stable id for the person (Google/Apple "sub"; for email, the address). */
  subject: string;
  email: string | null;
  /** Only a verified email may be used to find an existing account. */
  emailVerified: boolean;
  name?: string | null;
}

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
type Db = Pool | PoolConnection;

export const normalizeEmail = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
};

// ---------- one-time tickets ----------

export const TICKET_TTL = { oauth: 2 * 60_000, signup: 15 * 60_000 } as const;

/** Stores a payload behind a random token (only its hash is kept) and returns the token. */
export async function createTicket(
  pool: Db,
  kind: keyof typeof TICKET_TTL,
  payload: unknown,
  now: Date,
): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    'INSERT INTO auth_tickets (id, token_hash, kind, payload, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      newId(),
      sha(token),
      kind,
      JSON.stringify(payload),
      new Date(now.getTime() + TICKET_TTL[kind]),
      now,
    ],
  );
  return token;
}

/** Returns the ticket's payload and marks it used; a second use, an expired or unknown token all give null. */
export async function consumeTicket<T>(
  pool: Db,
  kind: keyof typeof TICKET_TTL,
  token: unknown,
  now: Date,
): Promise<T | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const [r] = (await pool.query(
    'UPDATE auth_tickets SET used_at = ? WHERE token_hash = ? AND kind = ? AND used_at IS NULL AND expires_at > ?',
    [now, sha(token), kind, now],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) return null;
  const [rows] = (await pool.query('SELECT payload FROM auth_tickets WHERE token_hash = ?', [
    sha(token),
  ])) as unknown as [{ payload: string }[]];
  return rows[0] ? (JSON.parse(rows[0].payload) as T) : null;
}

// ---------- finding and linking accounts ----------

/**
 * The account this identity belongs to: one it was linked to before, or (for a verified email) the account that
 * already has that email. Null means a new person, who still has to verify a mobile number.
 */
export async function findAccount(pool: Pool, id: Identity, now: Date): Promise<string | null> {
  const [linked] = (await pool.query(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?',
    [id.provider, id.subject],
  )) as unknown as [{ user_id: string }[]];
  if (linked[0]) {
    await pool.query(
      'UPDATE auth_identities SET last_used_at = ? WHERE provider = ? AND subject = ?',
      [now, id.provider, id.subject],
    );
    return linked[0].user_id;
  }
  if (id.email && id.emailVerified) {
    const [byEmail] = (await pool.query(
      'SELECT id FROM users WHERE email = ? AND email_verified_at IS NOT NULL',
      [id.email],
    )) as unknown as [{ id: string }[]];
    if (byEmail[0]) {
      await linkIdentity(pool, byEmail[0].id, id, now);
      return byEmail[0].id;
    }
  }
  return null;
}

/**
 * Remembers that this identity signs in to this account, and fills in the account's email and name when they are
 * still empty (never overwriting what the person set, never taking an email another account already has).
 */
export async function linkIdentity(pool: Db, userId: string, id: Identity, now: Date) {
  await pool.query(
    `INSERT INTO auth_identities (provider, subject, user_id, email, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE last_used_at = VALUES(last_used_at)`,
    [id.provider, id.subject, userId, id.email, now, now],
  );
  if (id.email && id.emailVerified) {
    await pool.query(
      `UPDATE users SET email = ?, email_verified_at = ?
        WHERE id = ? AND email IS NULL
          AND NOT EXISTS (SELECT 1 FROM (SELECT id FROM users WHERE email = ?) taken)`,
      [id.email, now, userId, id.email],
    );
  }
  const name = id.name?.trim().slice(0, 80);
  if (name && name.length >= 2)
    await pool.query("UPDATE users SET name = ? WHERE id = ? AND name = ''", [name, userId]);
}

/** The sign-in methods connected to an account, for the Account screen. */
export async function identitiesOf(pool: Pool, userId: string) {
  const [rows] = (await pool.query(
    'SELECT provider, email, created_at FROM auth_identities WHERE user_id = ? ORDER BY created_at',
    [userId],
  )) as unknown as [{ provider: Identity['provider']; email: string | null; created_at: Date }[]];
  return rows.map((r) => ({
    provider: r.provider,
    email: r.email,
    since: r.created_at.toISOString(),
  }));
}
