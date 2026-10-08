import type { Config } from '../config.js';
import { withTransaction, type Pool } from '../db.js';
import { newId, newSecretToken, sha256 } from '../lib/ids.js';
import { signToken } from '../lib/jwt.js';

export interface SessionDeps {
  pool: Pool;
  config: Pick<Config, 'JWT_SECRET' | 'ACCESS_TTL_MINUTES' | 'REFRESH_TTL_DAYS'>;
  clock?: () => Date;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  userId: string;
}

/** A refresh token that was rotated this recently is treated as a retry (lost response), not as theft. */
export const REUSE_GRACE_SECONDS = 10;

type Conn = { query: (sql: string, args?: unknown[]) => Promise<unknown> };

async function issue(
  deps: SessionDeps,
  c: Conn,
  userId: string,
  familyId: string,
  now: Date,
): Promise<Session> {
  const refreshToken = newSecretToken();
  const expires = new Date(now.getTime() + deps.config.REFRESH_TTL_DAYS * 86_400_000);
  await c.query(
    'INSERT INTO refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), userId, familyId, sha256(refreshToken), expires, now],
  );
  const expiresIn = deps.config.ACCESS_TTL_MINUTES * 60;
  return {
    accessToken: signToken(userId, deps.config.JWT_SECRET, expiresIn, now.getTime()),
    refreshToken,
    expiresIn,
    userId,
  };
}

/** A brand-new login (its own family of tokens). */
export function startSession(deps: SessionDeps, userId: string): Promise<Session> {
  const now = (deps.clock ?? (() => new Date()))();
  return withTransaction(deps.pool, (c) => issue(deps, c, userId, newId(), now));
}

type TokenRow = {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
};

/**
 * Swaps a refresh token for a fresh pair. Each token works once. Presenting one that was already used
 * (beyond a short retry window) means it may have been stolen, so the whole login is ended.
 */
export async function refreshSession(
  deps: SessionDeps,
  refreshToken: unknown,
): Promise<Session | null> {
  if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 200)
    return null;
  const now = (deps.clock ?? (() => new Date()))();
  return withTransaction(deps.pool, async (c) => {
    const [rows] = (await c.query(
      'SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at FROM refresh_tokens WHERE token_hash = ? FOR UPDATE',
      [sha256(refreshToken)],
    )) as unknown as [TokenRow[]];
    const t = rows[0];
    if (!t || t.revoked_at || t.expires_at.getTime() <= now.getTime()) return null;
    if (t.rotated_at) {
      if (now.getTime() - t.rotated_at.getTime() > REUSE_GRACE_SECONDS * 1000) {
        await c.query(
          'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL',
          [now, t.family_id],
        );
      }
      return null;
    }
    await c.query('UPDATE refresh_tokens SET rotated_at = ? WHERE id = ?', [now, t.id]);
    return issue(deps, c, t.user_id, t.family_id, now);
  });
}

/** Ends the login that this refresh token belongs to. Unknown tokens are ignored. */
export async function endSession(deps: SessionDeps, refreshToken: unknown): Promise<void> {
  if (typeof refreshToken !== 'string') return;
  const now = (deps.clock ?? (() => new Date()))();
  await deps.pool.query(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = (SELECT family_id FROM (SELECT family_id FROM refresh_tokens WHERE token_hash = ?) x) AND revoked_at IS NULL',
    [now, sha256(refreshToken)],
  );
}
