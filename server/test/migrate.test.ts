import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { createTestDb, type TestDb } from './db.js';

let db: TestDb;
let dir: string;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'mig-'));
  await db.pool.query('DROP TABLE IF EXISTS schema_migrations, t1, t2, t3');
});
const file = (name: string, sql: string) => writeFile(path.join(dir, name), sql);
const tables = async () =>
  ((await db.pool.query('SHOW TABLES')) as unknown as [Record<string, string>[]])[0].map(
    (r) => Object.values(r)[0],
  );

describe('runMigrations', () => {
  it('applies files in order, once each, and records them', async () => {
    await file('002_second.sql', 'CREATE TABLE t2 (id INT PRIMARY KEY);');
    await file(
      '001_first.sql',
      'CREATE TABLE t1 (id INT PRIMARY KEY);\nINSERT INTO t1 VALUES (1);',
    );
    expect((await runMigrations(db.pool, dir)).applied).toEqual([
      '001_first.sql',
      '002_second.sql',
    ]);
    expect(await tables()).toEqual(expect.arrayContaining(['t1', 't2', 'schema_migrations']));
  });

  it('a second run does nothing', async () => {
    await file('001_first.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    await runMigrations(db.pool, dir);
    expect(await runMigrations(db.pool, dir)).toEqual({ applied: [], skipped: ['001_first.sql'] });
  });

  it('a new file added later is applied on its own', async () => {
    await file('001_first.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    await runMigrations(db.pool, dir);
    await file('002_second.sql', 'CREATE TABLE t2 (id INT PRIMARY KEY);');
    expect(await runMigrations(db.pool, dir)).toEqual({
      applied: ['002_second.sql'],
      skipped: ['001_first.sql'],
    });
  });

  it('refuses to continue if an applied migration was edited', async () => {
    await file('001_first.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    await runMigrations(db.pool, dir);
    await file('001_first.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY, extra INT);');
    await expect(runMigrations(db.pool, dir)).rejects.toThrow(/was changed after it was applied/);
  });

  it('a failing migration is not recorded, so fixing it and running again works', async () => {
    await file('001_first.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    await file('002_bad.sql', 'CREATE TABLE t2 (id INT PRIMARY KEY);\nTHIS IS NOT SQL;');
    await expect(runMigrations(db.pool, dir)).rejects.toThrow();
    const [rows] = (await db.pool.query('SELECT name FROM schema_migrations')) as unknown as [
      { name: string }[],
    ];
    expect(rows.map((r) => r.name)).toEqual(['001_first.sql']);
    await db.pool.query('DROP TABLE IF EXISTS t2');
    await file('002_bad.sql', 'CREATE TABLE t2 (id INT PRIMARY KEY);');
    expect((await runMigrations(db.pool, dir)).applied).toEqual(['002_bad.sql']); // it was never recorded, so there is no checksum clash
  });

  it('two servers starting together apply each migration once', async () => {
    await file('001_first.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    const [a, b] = await Promise.all([runMigrations(db.pool, dir), runMigrations(db.pool, dir)]);
    expect([...a.applied, ...b.applied]).toEqual(['001_first.sql']);
    expect(a.skipped.length + b.skipped.length).toBe(1);
  });

  it('ignores files that are not numbered .sql migrations', async () => {
    await file('notes.txt', 'hello');
    await file('1_short.sql', 'CREATE TABLE t3 (id INT);');
    await file('001_ok.sql', 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    expect((await runMigrations(db.pool, dir)).applied).toEqual(['001_ok.sql']);
    expect(await tables()).not.toContain('t3');
  });

  it('the real migrations apply cleanly to an empty database', async () => {
    const fresh = await createTestDb();
    try {
      const real = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'migrations');
      const r = await runMigrations(fresh.pool, real);
      expect(r.applied[0]).toBe('001_foundation.sql');
      expect(await runMigrations(fresh.pool, real)).toMatchObject({ applied: [] });
    } finally {
      await fresh.drop();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
