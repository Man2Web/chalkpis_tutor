import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

// The harness clock is 8 Oct 2026, so "this month" is 2026-10.
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

const mkStudent = async (t: Tenant, over = {}) =>
  (
    await t.call('POST', '/students', {
      name: 'Asha Rao',
      parentPhone: '9876543210',
      monthlyFee: 100000,
      joinedAt: '2026-09-01T00:00:00.000Z',
      ...over,
    })
  ).body.id as string;
const advance = (t: Tenant, studentId: string, months: string[], extra = {}) =>
  t.call('POST', '/fees/advance', { studentId, months, mode: 'upi', ...extra });
const dues = async (t: Tenant, studentId: string) =>
  (await t.call('GET', `/fees/dues?status=all&studentId=${studentId}&limit=50`)).body.dues as {
    period: string;
    paid: number;
    status: string;
  }[];

describe('advance payment for several months', () => {
  it('creates the future months, pays each in full with its own receipt, and is one transaction', async () => {
    const s = await mkStudent(A, { discount: 10000 });
    await A.call('POST', '/fees/generate', {});
    const r = await advance(A, s, ['2026-12', '2026-10', '2026-11']);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.total).toBe(3 * 90000);
    expect(r.body.payments.map((p: { period: string }) => p.period)).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
    expect(new Set(r.body.payments.map((p: { receiptNo: string }) => p.receiptNo)).size).toBe(3);
    const d = await dues(A, s);
    expect(d.map((x) => [x.period, x.paid, x.status])).toEqual([
      ['2026-10', 90000, 'paid'],
      ['2026-11', 90000, 'paid'],
      ['2026-12', 90000, 'paid'],
    ]);
    // The monthly job later finds the month already there and paid: nothing new is owed.
    await A.call('POST', '/fees/generate', { period: '2026-11' });
    expect((await dues(A, s)).filter((x) => x.period === '2026-11')).toHaveLength(1);
  });

  it('pays only the rest of a part-paid month and skips months already paid', async () => {
    const s = await mkStudent(A);
    await A.call('POST', '/fees/generate', {});
    const oct = (await dues(A, s))[0] as unknown as { id: string };
    await A.call('POST', `/fees/dues/${oct.id}/payments`, { amount: 40000, mode: 'cash' });
    const r = await advance(A, s, ['2026-10', '2026-11']);
    expect(r.body.total).toBe(60000 + 100000);
    expect((await advance(A, s, ['2026-10', '2026-11'])).status).toBe(409); // nothing left to pay
  });

  it('refuses past months, more than a year ahead, months before joining, and non-monthly students', async () => {
    const s = await mkStudent(A);
    expect((await advance(A, s, ['2026-09'])).status).toBe(400);
    expect((await advance(A, s, ['2027-11'])).status).toBe(400);
    expect((await advance(A, s, ['2026-13'])).status).toBe(400);
    const late = await mkStudent(A, { name: 'Late', joinedAt: '2026-12-01T00:00:00.000Z' });
    expect((await advance(A, late, ['2026-11'])).status).toBe(400);
    const q = await mkStudent(A, { name: 'Quarterly', feeCycle: 'quarterly' });
    expect((await advance(A, q, ['2026-10'])).status).toBe(409);
    const free = await mkStudent(A, { name: 'Free', monthlyFee: 0 });
    expect((await advance(A, free, ['2026-10'])).status).toBe(409);
  });

  it('queues one parent message for the whole advance, not one per month', async () => {
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
    const s = await mkStudent(A);
    expect((await advance(A, s, ['2026-10', '2026-11', '2026-12'])).status).toBe(201);
    const [rows] = (await h.db.pool.query(
      "SELECT COUNT(*) AS n FROM messages WHERE institute_id = ? AND type = 'payment_received'",
      [A.instituteId],
    )) as unknown as [{ n: number }[]];
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it("cannot touch another institute's student", async () => {
    const s = await mkStudent(A);
    expect((await advance(B, s, ['2026-10'])).status).toBe(404);
    expect(await dues(A, s)).toHaveLength(0);
  });
});

describe('fees history', () => {
  it('gives each month billed and paid, with zero months filled in, and leaves out waived dues', async () => {
    const s1 = await mkStudent(A);
    const s2 = await mkStudent(A, { name: 'Bala', parentPhone: '9876500002' });
    await A.call('POST', '/fees/generate', {});
    await advance(A, s1, ['2026-10', '2026-11']);
    const d2 = (await dues(A, s2))[0] as unknown as { id: string };
    await A.call('POST', `/fees/dues/${d2.id}/waive`, { waived: true, note: 'scholarship' });
    const r = await A.call('GET', '/reports/fees-history?months=3');
    expect(r.status).toBe(200);
    expect(r.body.months).toEqual([
      { period: '2026-08', billed: 0, paid: 0, owingStudents: 0 },
      { period: '2026-09', billed: 0, paid: 0, owingStudents: 0 },
      { period: '2026-10', billed: 100000, paid: 100000, owingStudents: 0 },
    ]);
    expect((await B.call('GET', '/reports/fees-history')).body.months).toHaveLength(6);
    expect((await A.call('GET', '/reports/fees-history?months=99')).status).toBe(400);
  });
});
