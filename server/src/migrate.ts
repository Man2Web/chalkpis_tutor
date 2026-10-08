import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from './db.js';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

const LOCK = 'tutordesk_migrate';
const FILE = /^\d{3}_[a-z0-9_]+\.sql$/;

const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');

/**
 * Applies the numbered .sql files in `dir`, in order, once each. Rules:
 * - a database lock stops two servers from migrating at the same time;
 * - an applied migration that was edited afterwards stops everything (never rewrite history, add a new file);
 * - a failed migration is not recorded, so fixing the file and restarting retries it.
 */
export async function runMigrations(pool: Pool, dir: string): Promise<MigrationResult> {
  const files = (await readdir(dir)).filter((f) => FILE.test(f)).sort();
  const conn = await pool.getConnection();
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    const [[lock]] = (await conn.query('SELECT GET_LOCK(?, 60) AS got', [LOCK])) as unknown as [
      [{ got: number }],
    ];
    if (lock?.got !== 1) throw new Error('could not get the migration lock');
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(100) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      const [rows] = (await conn.query(
        'SELECT name, checksum FROM schema_migrations',
      )) as unknown as [{ name: string; checksum: string }[]];
      const done = new Map(rows.map((r) => [r.name, r.checksum]));

      for (const name of files) {
        const sql = await readFile(path.join(dir, name), 'utf8');
        const sum = checksum(sql);
        const known = done.get(name);
        if (known) {
          if (known !== sum)
            throw new Error(
              `migration ${name} was changed after it was applied; add a new migration instead`,
            );
          result.skipped.push(name);
          continue;
        }
        // Statements are split on ";" at line end; migrations must not contain ";" inside strings.
        const statements = sql
          .split(/;\s*(?:\r?\n|$)/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const stmt of statements) await conn.query(stmt);
        await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [
          name,
          sum,
        ]);
        result.applied.push(name);
      }
    } finally {
      await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]);
    }
  } finally {
    conn.release();
  }
  return result;
}
