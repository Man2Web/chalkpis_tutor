import { sha256 } from './ids.js';
import type { Pool, PoolConnection } from '../db.js';

/**
 * Runs `fn` while holding a named database lock, so two requests for the same thing (for example two login-code
 * requests for one phone) cannot run side by side and slip past a counter. Waits up to 5 s, then gives up.
 *
 * `fn` receives the SAME connection that holds the lock and must do all its work on it. Taking a second connection
 * while holding the lock can starve the pool: enough waiting requests would hold every connection and none could proceed.
 */
export async function withNamedLock<T>(
  pool: Pool,
  name: string,
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const key = `td:${sha256(name).slice(0, 40)}`;
  const conn = await pool.getConnection();
  try {
    const [[row]] = (await conn.query('SELECT GET_LOCK(?, 5) AS got', [key])) as unknown as [
      [{ got: number }],
    ];
    if (row?.got !== 1) throw new Error('busy');
    try {
      return await fn(conn);
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [key]);
    }
  } finally {
    conn.release();
  }
}
