import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import type { Config } from './config.js';

export type { Pool, PoolConnection };

/** One shared pool. UTC everywhere, utf8mb4 (Hindi names), money and ids come back as plain numbers/strings. */
export function createPool(
  cfg: Pick<
    Config,
    'DB_HOST' | 'DB_PORT' | 'DB_USER' | 'DB_PASSWORD' | 'DB_NAME' | 'DB_POOL_SIZE' | 'DB_SSL'
  >,
): Pool {
  return mysql.createPool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    database: cfg.DB_NAME,
    connectionLimit: cfg.DB_POOL_SIZE,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: true,
    ssl: cfg.DB_SSL ? { rejectUnauthorized: true } : undefined,
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 10_000,
  });
}

/** True when the database answers a trivial query. Never throws. */
export async function ping(pool: Pool): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `fn` in a transaction: committed if it returns, rolled back if it throws. The connection always goes
 * back to the pool. Use this for anything that must be all-or-nothing (receipt numbers, payments).
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  const conn = await pool.getConnection();
  try {
    return await inTransaction(conn, fn);
  } finally {
    conn.release();
  }
}

/** The same all-or-nothing rule on a connection you already hold (for example while holding a named lock). */
export async function inTransaction<T>(
  conn: PoolConnection,
  fn: (conn: PoolConnection) => Promise<T>,
): Promise<T> {
  await conn.beginTransaction();
  try {
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      // the original error is the useful one
    }
    throw e;
  }
}
