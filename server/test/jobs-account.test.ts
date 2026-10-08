import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { runDueJobs } from '../src/jobs/runner.js';
import { istHour } from '../src/lib/ist.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';
import { testConfig } from './db.js';

let h: Harness;
let A: Tenant;
let B: Tenant;
const log = { info: () => {}, error: () => {} };
const errors: string[] = [];
const noisyLog = { info: () => {}, error: (_o: object, m: string) => void errors.push(m) };

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  errors.length = 0;
  A = await h.tenant('+919876543210', { institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const at = (iso: string) => new Date(iso); // times below are UTC; Indian time is +5:30
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('png-bytes-here'),
]);
const student = (over = {}) => ({
  name: 'Asha Rao',
  parentName: 'Mr Rao',
  parentPhone: '9876500001',
  monthlyFee: 100000,
  ...over,
});
const mk = async (t: Tenant, p: string, body: unknown) =>
  (await t.call('POST', p, body)).body.id as string;
const count = async (table: string, where = '1=1') =>
  Number(
    (
      (await h.db.pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)) as unknown as [
        { n: number }[],
      ]
    )[0][0]!.n,
  );

describe('Indian clock', () => {
  it('istHour follows Indian time', () => {
    expect([
      istHour(at('2026-10-08T00:00:00Z')),
      istHour(at('2026-10-08T03:29:00Z')),
      istHour(at('2026-10-08T03:30:00Z')),
      istHour(at('2026-10-08T18:30:00Z')),
    ]).toEqual([5, 8, 9, 0]);
  });
});

describe('scheduler', () => {
  it("creates the month's dues once a day for institutes with a live plan", async () => {
    await mk(A, '/students', student());
    await mk(B, '/students', student());
    await h.db.pool.query("UPDATE subscriptions SET status = 'expired' WHERE institute_id = ?", [
      B.instituteId,
    ]);
    expect(await runDueJobs(h.db.pool, at('2026-10-08T01:00:00Z'), log)).toContain('dues'); // 06:30 IST
    expect(await count('fee_dues', `institute_id = '${A.instituteId}'`)).toBe(1);
    expect(await count('fee_dues', `institute_id = '${B.instituteId}'`)).toBe(0); // read-only plan: no new dues
    expect(await runDueJobs(h.db.pool, at('2026-10-08T05:00:00Z'), log)).not.toContain('dues'); // already ran today
    expect(await runDueJobs(h.db.pool, at('2026-10-09T01:00:00Z'), log)).toContain('dues'); // next day runs again
  });

  it('does not run before its hour', async () => {
    expect(await runDueJobs(h.db.pool, at('2026-10-07T20:00:00Z'), log)).toEqual(['expire']); // 01:30 IST: only the hourly one
    expect(await runDueJobs(h.db.pool, at('2026-10-07T21:30:00Z'), log)).toEqual([
      'dues',
      'expire',
    ]); // 03:00 IST: dues may run now
  });

  it('expires plans hourly', async () => {
    await h.db.pool.query(
      "UPDATE subscriptions SET plan = 'starter', expires_at = '2026-10-08 00:00:00' WHERE institute_id = ?",
      [A.instituteId],
    );
    await runDueJobs(h.db.pool, at('2026-10-08T06:00:00Z'), log);
    expect(
      (
        (await h.db.pool.query('SELECT status FROM subscriptions WHERE institute_id = ?', [
          A.instituteId,
        ])) as unknown as [{ status: string }[]]
      )[0][0]!.status,
    ).toBe('expired');
    expect(await runDueJobs(h.db.pool, at('2026-10-08T06:10:00Z'), log)).not.toContain('expire'); // same hour
    expect(await runDueJobs(h.db.pool, at('2026-10-08T07:10:00Z'), log)).toContain('expire'); // next hour
  });

  it('queues fee reminders at 9 am Indian time, not after 6 pm', async () => {
    const s = await mk(A, '/students', student({ dueDay: 10 }));
    await A.call('POST', '/fees/generate', {});
    await A.call('PUT', '/settings/notifications', {
      enabled: true,
      absent: true,
      late: true,
      feeDue: true,
      feeDueDaysBefore: 2,
      feeOverdue: true,
      overdueEveryDays: 7,
      paymentReceived: true,
      language: 'en',
    });
    expect(s).toBeTruthy();
    expect(await runDueJobs(h.db.pool, at('2026-10-08T02:00:00Z'), log)).not.toContain('reminders'); // 07:30 IST: too early
    expect(await count('messages')).toBe(0);
    expect(await runDueJobs(h.db.pool, at('2026-10-08T04:00:00Z'), log)).toContain('reminders'); // 09:30 IST
    expect(await count('messages')).toBe(1);
    await h.db.pool.query('DELETE FROM job_runs');
    expect(await runDueJobs(h.db.pool, at('2026-10-08T17:00:00Z'), log)).not.toContain('reminders'); // 22:30 IST: too late
  });

  it('two schedulers at once run each job once', async () => {
    await mk(A, '/students', student());
    const results = await Promise.all(
      Array.from({ length: 5 }, () => runDueJobs(h.db.pool, at('2026-10-08T04:00:00Z'), log)),
    );
    expect(results.flat().filter((j) => j === 'dues')).toHaveLength(1);
    expect(await count('fee_dues')).toBe(1);
  });

  it('a failing job gives its claim back so the next pass retries, and never stops the others', async () => {
    const jobs = [
      {
        name: 'boom',
        from: 0,
        until: 23,
        every: 'day' as const,
        run: async () => {
          throw new Error('secret detail');
        },
      },
      { name: 'fine', from: 0, until: 23, every: 'day' as const, run: async () => 3 },
    ];
    expect(await runDueJobs(h.db.pool, at('2026-10-08T04:00:00Z'), noisyLog, jobs)).toEqual([
      'fine',
    ]);
    expect(errors).toEqual(['job failed']);
    expect(await count('job_runs', "job = 'boom'")).toBe(0);
    expect(await count('job_runs', "job = 'fine'")).toBe(1);
  });

  it('cleanup removes only old finished rows', async () => {
    const old = '2026-01-01 00:00:00';
    await h.db.pool.query(
      "INSERT INTO otp_codes (id, phone, code_hash, expires_at) VALUES (UUID(), '+919000000001', 'x', ?), (UUID(), '+919000000002', 'x', '2026-10-08 06:05:00')",
      [old],
    );
    const s = await mk(A, '/students', student());
    const l = await A.call('POST', `/students/${s}/parent-link`, { days: 1 });
    expect(l.status).toBe(201);
    await h.db.pool.query("UPDATE parent_links SET expires_at = '2026-01-01 00:00:00'");
    await h.db.pool.query(
      "INSERT INTO messages (id, institute_id, student_id, type, dedupe_key, lang, to_last4, status, created_at) VALUES (UUID(), ?, ?, 'absent', 'old', 'en', '0001', 'sent', '2026-01-01 00:00:00'), (UUID(), ?, ?, 'absent', 'new', 'en', '0001', 'sent', '2026-10-01 00:00:00'), (UUID(), ?, ?, 'absent', 'queued-old', 'en', '0001', 'queued', '2026-01-01 00:00:00')",
      [A.instituteId, s, A.instituteId, s, A.instituteId, s],
    );
    await runDueJobs(h.db.pool, at('2026-10-08T05:30:00Z'), log); // 11:00 IST
    expect(await count('otp_codes')).toBe(1);
    expect(await count('parent_links')).toBe(0);
    expect(
      (
        (await h.db.pool.query(
          'SELECT dedupe_key FROM messages ORDER BY dedupe_key',
        )) as unknown as [{ dedupe_key: string }[]]
      )[0].map((r) => r.dedupe_key),
    ).toEqual(['new', 'queued-old']);
  });
});

describe('deleting an account', () => {
  const del = (t: Tenant, body: unknown = { confirm: true }) => t.call('DELETE', '/account', body);

  it('needs an explicit confirmation', async () => {
    for (const body of [{}, { confirm: false }, { confirm: 'yes' }, []])
      expect((await del(A, body)).status).toBe(400);
    expect(await count('institutes')).toBe(2);
  });

  it('owner: removes the whole institute and its pictures, the login, and nothing of anyone else', async () => {
    const b = await mk(A, '/batches', {
      name: 'Maths 10',
      subject: 'Maths',
      class: '10',
      days: ['thu'],
      startTime: '17:00',
      endTime: '18:00',
      defaultFee: 1,
    });
    const s = await mk(A, '/students', student({ batchIds: [b] }));
    await mk(B, '/students', student({ name: 'Beta Kid' }));
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0].id as string;
    await A.call('POST', `/fees/dues/${due}/payments`, { amount: 1000, mode: 'cash' });
    await A.call('PUT', '/attendance', { batchId: b, date: '2026-10-08', marks: { [s]: 'A' } });
    await A.call('POST', `/students/${s}/parent-link`, {});
    const put = (url: string) =>
      h.app.inject({
        method: 'PUT',
        url,
        headers: { authorization: `Bearer ${A.token}`, 'content-type': 'image/png' },
        payload: PNG,
      });
    await put('/institute/logo');
    await put(`/students/${s}/photo`);
    const order = await A.call('POST', '/billing/links', { planId: 'starter' });
    await A.call('POST', '/billing/mock/complete', { orderId: order.body.orderId });
    expect(await fs.readdir(path.join(h.filesDir, 'logos'))).toHaveLength(1);

    const r = await del(A);
    expect([r.status, r.body]).toEqual([200, { ok: true, deletedInstitute: true }]);
    for (const [table, w] of [
      ['institutes', `id = '${A.instituteId}'`],
      ['users', `id = '${A.userId}'`],
      ['students', `institute_id = '${A.instituteId}'`],
      ['batches', `institute_id = '${A.instituteId}'`],
      ['fee_dues', `institute_id = '${A.instituteId}'`],
      ['payments', `institute_id = '${A.instituteId}'`],
      ['attendance_days', `institute_id = '${A.instituteId}'`],
      ['parent_links', `institute_id = '${A.instituteId}'`],
      ['subscriptions', `institute_id = '${A.instituteId}'`],
      ['memberships', `institute_id = '${A.instituteId}'`],
      ['billing_orders', `institute_id = '${A.instituteId}'`],
    ] as const)
      expect([table, await count(table, w)]).toEqual([table, 0]);
    expect(await fs.readdir(path.join(h.filesDir, 'logos'))).toHaveLength(0);
    expect(await fs.readdir(path.join(h.filesDir, 'photos'))).toHaveLength(0);
    expect(await count('billing_events', 'institute_id IS NULL')).toBe(1); // the plan payment stays for accounting, cut loose from the institute
    expect(await count('students', `institute_id = '${B.instituteId}'`)).toBe(1); // B untouched
    expect((await B.call('GET', '/students')).body.students).toHaveLength(1);
    expect((await A.call('GET', '/students')).status).toBe(401); // the old token no longer works
  });

  it('staff: only their own login goes; the institute stays', async () => {
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM institutes WHERE id = ?', [staff.instituteId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    const r = await del(staff);
    expect(r.body).toEqual({ ok: true, deletedInstitute: false });
    expect(await count('users', `id = '${staff.userId}'`)).toBe(0);
    expect(await count('institutes', `id = '${A.instituteId}'`)).toBe(1);
  });

  it('works while the plan is expired and needs a login', async () => {
    expect(
      (await h.app.inject({ method: 'DELETE', url: '/account', payload: { confirm: true } }))
        .statusCode,
    ).toBe(401);
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const { signToken } = await import('../src/lib/jwt.js');
    const token = signToken(
      B.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const r = await h.app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { confirm: true },
    });
    expect(r.statusCode).toBe(200);
  });
});

describe('deleting an account is rate limited', () => {
  it('allows 5 tries a minute from one address', async () => {
    const fresh = await buildApp({
      config: testConfig({ ...h.db.config, FILES_DIR: h.filesDir }),
      pool: h.db.pool,
      clock: () => h.clock.now,
    });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++)
      codes.push(
        (
          await fresh.inject({
            method: 'DELETE',
            url: '/account',
            headers: { authorization: `Bearer ${A.token}` },
            payload: { confirm: false },
          })
        ).statusCode,
      );
    await fresh.close();
    expect(codes).toEqual([400, 400, 400, 400, 400, 429, 429]);
  });
});

describe('browser access and caching headers', () => {
  it('API answers are never cached; logos and the parent page keep their own rules', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/health/live' });
    expect(r.headers['cache-control']).toBe('no-store');
    expect((await A.call('GET', '/students')).status).toBe(200);
    expect(
      (await h.app.inject({ method: 'GET', url: '/parent.css' })).headers['cache-control'],
    ).toBe('public, max-age=300');
    expect((await h.app.inject({ method: 'GET', url: '/p/x' })).headers['cache-control']).toBe(
      'no-store',
    );
  });

  it('CORS is closed unless an origin is listed', async () => {
    const preflight = (app: typeof h.app, origin: string) =>
      app.inject({
        method: 'OPTIONS',
        url: '/students',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });
    expect(
      (await preflight(h.app, 'http://localhost:8081')).headers['access-control-allow-origin'],
    ).toBeUndefined();
    const open = await buildApp({
      config: testConfig({
        ...h.db.config,
        FILES_DIR: h.filesDir,
        CORS_ORIGINS: ['http://localhost:8081'],
      }),
      pool: h.db.pool,
    });
    const ok = await preflight(open, 'http://localhost:8081');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(
      (await preflight(open, 'https://evil.example')).headers['access-control-allow-origin'],
    ).toBeUndefined();
    await open.close();
  });
});
