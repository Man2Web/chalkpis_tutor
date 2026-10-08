import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/migrate.js';
import { withTransaction } from '../src/db.js';
import { createTestDb, type TestDb } from './db.js';

let db: TestDb;
const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) =>
  ((await db.pool.query(sql, args)) as unknown as [T[]])[0];
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeAll(async () => {
  db = await createTestDb();
  await runMigrations(
    db.pool,
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'migrations'),
  );
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['subscriptions', 'memberships', 'institutes', 'users'])
    await db.pool.query(`TRUNCATE ${t}`);
  await db.pool.query('SET FOREIGN_KEY_CHECKS=1');
});

const user = (n: number, phone = `+9198765432${String(n).padStart(2, '0')}`) =>
  q('INSERT INTO users (id, phone, name) VALUES (?, ?, ?)', [uid(n), phone, `User ${n}`]);
const institute = (n: number, owner: number) =>
  q('INSERT INTO institutes (id, name, owner_user_id) VALUES (?, ?, ?)', [
    uid(100 + n),
    `Inst ${n}`,
    uid(owner),
  ]);

describe('foundation schema', () => {
  it('applies defaults sensibly', async () => {
    await user(1);
    await institute(1, 1);
    const [i] = await q<{
      receipt_prefix: string;
      next_receipt_no: number;
      timezone: string;
      currency: string;
    }>('SELECT * FROM institutes');
    expect(i).toMatchObject({
      receipt_prefix: 'TD',
      next_receipt_no: 1,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    });
    const [u] = await q<{ language: string }>('SELECT * FROM users');
    expect(u?.language).toBe('en');
  });

  it('one account per phone number', async () => {
    await user(1, '+919876543210');
    await expect(user(2, '+919876543210')).rejects.toThrow(/Duplicate/);
  });

  it('an institute must have a real owner', async () => {
    await expect(institute(1, 99)).rejects.toThrow(/foreign key/i);
  });

  it('a user belongs to at most one institute', async () => {
    await user(1);
    await institute(1, 1);
    await institute(2, 1);
    await q("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'owner')", [
      uid(1),
      uid(101),
    ]);
    await expect(
      q("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')", [
        uid(1),
        uid(102),
      ]),
    ).rejects.toThrow(/Duplicate/);
  });

  it('rejects values outside the allowed lists (role, plan, language)', async () => {
    await user(1);
    await institute(1, 1);
    await expect(
      q("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'admin')", [
        uid(1),
        uid(101),
      ]),
    ).rejects.toThrow();
    await expect(
      q(
        "INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at) VALUES (?, 'platinum', 'active', NOW(), NOW())",
        [uid(101)],
      ),
    ).rejects.toThrow();
    await expect(q("UPDATE users SET language = 'fr'")).rejects.toThrow();
  });

  it('deleting an institute removes its memberships and subscription, nothing else', async () => {
    await user(1);
    await user(2);
    await institute(1, 1);
    await institute(2, 2);
    for (const [u, i] of [
      [1, 101],
      [2, 102],
    ] as const) {
      await q("INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'owner')", [
        uid(u),
        uid(i),
      ]);
      await q(
        "INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at) VALUES (?, 'trial', 'active', NOW(3), DATE_ADD(NOW(3), INTERVAL 7 DAY))",
        [uid(i)],
      );
    }
    await q('DELETE FROM institutes WHERE id = ?', [uid(101)]);
    expect(await q('SELECT institute_id FROM memberships')).toEqual([{ institute_id: uid(102) }]);
    expect(await q('SELECT institute_id FROM subscriptions')).toEqual([{ institute_id: uid(102) }]);
  });

  it('stores Hindi and emoji text without damage (utf8mb4)', async () => {
    await q('INSERT INTO users (id, phone, name) VALUES (?, ?, ?)', [
      uid(1),
      '+919876543210',
      'आशा राव 🎓',
    ]);
    const [u] = await q<{ name: string }>('SELECT name FROM users');
    expect(u?.name).toBe('आशा राव 🎓');
  });

  it('keeps millisecond times and returns them as UTC', async () => {
    await user(1);
    await institute(1, 1);
    await q(
      "INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at) VALUES (?, 'starter', 'active', '2026-10-08 06:00:00.123', '2027-01-08 06:00:00.456')",
      [uid(101)],
    );
    const [s] = await q<{ expires_at: Date }>('SELECT expires_at FROM subscriptions');
    expect(s?.expires_at.toISOString()).toBe('2027-01-08T06:00:00.456Z');
  });

  it('unlimited limits are NULL, not zero', async () => {
    await user(1);
    await institute(1, 1);
    await q(
      "INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at) VALUES (?, 'pro', 'active', NOW(3), NOW(3))",
      [uid(101)],
    );
    const [s] = await q<{ student_limit: number | null }>(
      'SELECT student_limit FROM subscriptions',
    );
    expect(s?.student_limit).toBeNull();
  });

  it('SQL injection text is stored as plain text when passed as a parameter', async () => {
    await q('INSERT INTO users (id, phone, name) VALUES (?, ?, ?)', [
      uid(1),
      '+919876543210',
      "x'); DROP TABLE users;--",
    ]);
    expect(await q('SELECT COUNT(*) AS n FROM users')).toEqual([{ n: 1 }]);
  });
});

describe('withTransaction', () => {
  it('commits when the work finishes', async () => {
    await withTransaction(db.pool, async (c) => {
      await c.query('INSERT INTO users (id, phone) VALUES (?, ?)', [uid(1), '+919876543210']);
    });
    expect(await q('SELECT COUNT(*) AS n FROM users')).toEqual([{ n: 1 }]);
  });
  it('rolls everything back when the work throws, and frees the connection', async () => {
    await expect(
      withTransaction(db.pool, async (c) => {
        await c.query('INSERT INTO users (id, phone) VALUES (?, ?)', [uid(1), '+919876543210']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await q('SELECT COUNT(*) AS n FROM users')).toEqual([{ n: 0 }]);
    for (let i = 0; i < 12; i++) await withTransaction(db.pool, async () => undefined); // more than the pool size: no leaked connections
  });
});
