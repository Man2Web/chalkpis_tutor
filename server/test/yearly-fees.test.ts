import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { enqueueFeeReminders } from '../src/messaging/notify.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  A = await h.tenant('+919876543210', { institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

// The fixed test clock is 2026-10-08 11:30 Indian time.
const student = (over = {}) => ({
  name: 'Asha Rao',
  parentPhone: '9876543210',
  monthlyFee: 100000,
  joinedAt: '2026-09-15T00:00:00.000Z',
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const PARTS = [
  { amount: 1000000, dueDate: '2026-10-10' },
  { amount: 700000, dueDate: '2027-01-10' },
  { amount: 700000, dueDate: '2027-04-10' },
];
const plan = (t: Tenant, studentIds: string[], over = {}) =>
  t.call('POST', '/fees/plans', { studentIds, title: 'Yearly fee 2026-27', parts: PARTS, ...over });
type Due = {
  id: string;
  kind: string;
  planId: string | null;
  period: string;
  amount: number;
  dueDate: string;
  description: string;
  status: string;
  outstanding: number;
};
const duesOf = async (t: Tenant, studentId: string) =>
  (await t.call('GET', `/fees/dues?status=all&studentId=${studentId}`)).body.dues as Due[];

describe('yearly fee plans', () => {
  it('creates one instalment due per part and moves the student off monthly billing', async () => {
    const s = await mk(A, '/students', student());
    const r = await plan(A, [s]);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ created: 1, skipped: [] });
    const [planId] = r.body.planIds as string[];

    const dues = await duesOf(A, s);
    expect(dues).toHaveLength(3);
    expect(
      dues.map((d) => [d.kind, d.planId, d.period, d.amount, d.dueDate, d.description]),
    ).toEqual([
      ['instalment', planId, '2026-10', 1000000, '2026-10-10', 'Yearly fee 2026-27 (1 of 3)'],
      ['instalment', planId, '2027-01', 700000, '2027-01-10', 'Yearly fee 2026-27 (2 of 3)'],
      ['instalment', planId, '2027-04', 700000, '2027-04-10', 'Yearly fee 2026-27 (3 of 3)'],
    ]);

    const st = (await A.call('GET', `/students/${s}`)).body;
    expect(st).toMatchObject({ feeCycle: 'yearly', monthlyFee: 2400000 });

    // the monthly job no longer bills a yearly student
    expect((await A.call('POST', '/fees/generate', {})).status).toBeLessThan(300);
    expect((await A.call('POST', '/fees/generate', { period: '2026-11' })).status).toBeLessThan(
      300,
    );
    expect(await duesOf(A, s)).toHaveLength(3);
  });

  it('a single-part plan is just the title', async () => {
    const s = await mk(A, '/students', student());
    await plan(A, [s], {
      title: 'Annual fee',
      parts: [{ amount: 1500000, dueDate: '2026-11-01' }],
    });
    expect((await duesOf(A, s))[0]).toMatchObject({ description: 'Annual fee', amount: 1500000 });
  });

  it('each part is collected like any other due, with a receipt', async () => {
    const s = await mk(A, '/students', student());
    await plan(A, [s]);
    const first = (await duesOf(A, s))[0]!;
    const r = await A.call('POST', `/fees/dues/${first.id}/payments`, {
      amount: 400000,
      mode: 'upi',
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ balanceAfter: 600000, status: 'partial' });
    expect((await duesOf(A, s))[0]).toMatchObject({ outstanding: 600000, status: 'partial' });
    const overview = (await A.call('GET', '/fees/overview')).body;
    expect(overview.totals.outstanding).toBe(600000 + 700000 + 700000);
  });

  it('applies to a whole batch at once, skipping students who already have the plan', async () => {
    const s1 = await mk(A, '/students', student());
    const s2 = await mk(A, '/students', student({ name: 'Bala K' }));
    expect((await plan(A, [s1])).status).toBe(201);
    const r = await plan(A, [s1, s2]);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ created: 1, skipped: [s1] });
    expect(await duesOf(A, s1)).toHaveLength(3); // not billed twice
    expect(await duesOf(A, s2)).toHaveLength(3);
    // everyone already has it: nothing changes
    expect((await plan(A, [s1, s2])).body.error).toBe('plan_exists');
    // a different title is a different plan (next year)
    expect((await plan(A, [s1], { title: 'Yearly fee 2027-28' })).status).toBe(201);
    expect(await duesOf(A, s1)).toHaveLength(6);
  });

  it("rejects parts out of order, bad amounts and dates, and other centres' students", async () => {
    const s = await mk(A, '/students', student());
    const other = await mk(B, '/students', student());
    const bad = async (over: object) => (await plan(A, [s], over)).status;
    expect(
      (
        await plan(A, [s], {
          parts: [
            { amount: 1000, dueDate: '2027-01-10' },
            { amount: 1000, dueDate: '2026-10-10' },
          ],
        })
      ).body.error,
    ).toBe('parts_out_of_order');
    expect(await bad({ parts: [] })).toBe(400);
    expect(await bad({ parts: [{ amount: 0, dueDate: '2026-10-10' }] })).toBe(400);
    expect(await bad({ parts: [{ amount: 1.5, dueDate: '2026-10-10' }] })).toBe(400);
    expect(await bad({ parts: [{ amount: 1000, dueDate: '2026-02-30' }] })).toBe(400);
    expect(await bad({ title: ' ' })).toBe(400);
    expect(await bad({ parts: Array.from({ length: 13 }, () => PARTS[0]) })).toBe(400);
    expect((await plan(A, [s, other])).body.error).toBe('unknown_student');
    expect(await duesOf(A, s)).toHaveLength(0); // all or nothing
    expect((await plan(B, [s])).body.error).toBe('unknown_student');
  });

  it('removing a plan deletes only the parts nothing was ever paid on', async () => {
    const s = await mk(A, '/students', student());
    const [planId] = (await plan(A, [s])).body.planIds as string[];
    const [first, second] = await duesOf(A, s);
    await A.call('POST', `/fees/dues/${first!.id}/payments`, { amount: 1000000, mode: 'cash' });
    // a payment that was reversed still keeps its part (the receipt must not disappear)
    const pay = await A.call('POST', `/fees/dues/${second!.id}/payments`, {
      amount: 1000,
      mode: 'cash',
    });
    await A.call('POST', `/fees/payments/${pay.body.paymentId}/reverse`);

    expect((await B.call('DELETE', `/fees/plans/${planId}`)).status).toBe(404);
    const r = await A.call('DELETE', `/fees/plans/${planId}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ removed: 1, kept: 2 });
    expect((await duesOf(A, s)).map((d) => d.description)).toEqual([
      'Yearly fee 2026-27 (1 of 3)',
      'Yearly fee 2026-27 (2 of 3)',
    ]);
    // the plan still has parts, so it stays (and its title stays taken)
    expect((await plan(A, [s])).body.error).toBe('plan_exists');
  });

  it('a plan removed completely can be set up again', async () => {
    const s = await mk(A, '/students', student());
    const [planId] = (await plan(A, [s])).body.planIds as string[];
    expect((await A.call('DELETE', `/fees/plans/${planId}`)).body).toEqual({ removed: 3, kept: 0 });
    expect(await duesOf(A, s)).toHaveLength(0);
    expect((await A.call('DELETE', `/fees/plans/${planId}`)).status).toBe(404);
    expect((await plan(A, [s])).status).toBe(201);
  });

  it('parts get the usual "due soon" reminder before their own due date', async () => {
    await A.call('PUT', '/settings/notifications', {
      enabled: true,
      absent: true,
      late: true,
      feeDue: true,
      feeDueDaysBefore: 2,
      feeOverdue: true,
      overdueEveryDays: 7,
      paymentReceived: true,
      studentWelcome: false,
      language: 'en',
    });
    const s = await mk(A, '/students', student());
    await plan(A, [s]); // first part due 10 Oct, today is 8 Oct
    expect(await enqueueFeeReminders(h.db.pool, A.instituteId, h.clock.now)).toBe(1);
    // months later the trial would have ended (reminders stop then): give the centre a paid plan
    await h.db.pool.query(
      "UPDATE subscriptions SET plan = 'pro', expires_at = '2027-12-31 00:00:00' WHERE institute_id = ?",
      [A.instituteId],
    );
    h.clock.now = new Date('2027-01-08T06:00:00Z'); // two days before the second part
    const [queued] = (await h.db.pool.query(
      "SELECT dedupe_key FROM messages WHERE institute_id = ? AND type = 'fee_due' ORDER BY dedupe_key",
      [A.instituteId],
    )) as unknown as [{ dedupe_key: string }[]];
    expect(queued).toHaveLength(1);
    // the first part is now overdue (its own reminder), the second is due in two days
    expect(await enqueueFeeReminders(h.db.pool, A.instituteId, h.clock.now)).toBeGreaterThanOrEqual(
      1,
    );
    const [after] = (await h.db.pool.query(
      "SELECT COUNT(*) AS n FROM messages WHERE institute_id = ? AND type = 'fee_due'",
      [A.instituteId],
    )) as unknown as [{ n: number }[]];
    expect(Number(after[0]!.n)).toBe(2);
  });

  it('the owner can still switch a yearly student back to monthly', async () => {
    const s = await mk(A, '/students', student());
    await plan(A, [s]);
    const r = await A.call('PATCH', `/students/${s}`, { feeCycle: 'monthly', monthlyFee: 150000 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    await A.call('POST', '/fees/generate', { period: '2026-11' });
    expect((await duesOf(A, s)).filter((d) => d.kind === 'regular')).toHaveLength(1);
  });
});
