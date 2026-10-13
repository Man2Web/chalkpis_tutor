import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signId } from '../src/billing/payLink.js';
import { varsFor } from '../src/messaging/templates.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const SECRET = 'test-jwt-secret-test-jwt-secret-1234';
let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  A = await h.tenant('+919800000001', { institute: 'Kiran Karate Academy' });
  B = await h.tenant('+919800000002');
});

const mkStudent = async (t: Tenant, monthlyFee = 150000) => {
  const r = await t.call('POST', '/students', {
    name: 'Riya Sharma',
    parentPhone: '9876543210',
    monthlyFee,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await t.call('POST', '/fees/generate', { period: '2026-10' });
  return r.body.id as string;
};
const link = (studentId: string) => `/f/${signId(SECRET, 'paid', studentId)}`;
const report = (studentId: string, ref = '') =>
  h.app.inject({
    method: 'POST',
    url: link(studentId),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ ref }).toString(),
  });
const reportsOf = async (t: Tenant) =>
  (await t.call('GET', '/fees/reports')).body.reports as {
    id: string;
    amountPaise: number;
    upiRef: string;
  }[];
const receipts = async (t: Tenant) =>
  Number(
    (
      (await h.db.pool.query(
        "SELECT COUNT(*) AS n FROM messages WHERE institute_id = ? AND type = 'payment_received'",
        [t.instituteId],
      )) as unknown as [{ n: number }[]]
    )[0][0]!.n,
  );

describe('"I\'ve paid" from the parent', () => {
  it('shows what is pending, takes one report, and thanks the parent', async () => {
    const s = await mkStudent(A);
    const page = await h.app.inject({ method: 'GET', url: link(s) });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).not.toContain('script-src');
    expect(page.body).toContain('Riya Sharma');
    expect(page.body).toContain('₹1,500 is pending');
    expect(page.body).toContain("I've paid ₹1,500");

    const r = await report(s, '4123 5678 9012<x>');
    expect(r.body).toContain('Thank you! We have told the centre.');
    expect(r.body).toContain('that you paid ₹1,500');
    await report(s); // a second tap does not make a second report
    const list = await reportsOf(A);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ amountPaise: 150000, upiRef: '412356789012x' });

    expect((await h.app.inject({ method: 'GET', url: `/f/${'A'.repeat(38)}` })).statusCode).toBe(
      404,
    );
    // a pay-page token for the same id is not an "I've paid" token
    expect(
      (await h.app.inject({ method: 'GET', url: `/f/${signId(SECRET, 'pay', s)}` })).statusCode,
    ).toBe(404);
  });

  it('confirming records the payment, sends one receipt and closes the report', async () => {
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
    await report(s, '412356789012');
    const [r] = await reportsOf(A);

    // another centre cannot touch it
    expect((await B.call('POST', `/fees/reports/${r!.id}/confirm`)).status).toBe(404);

    const ok = await A.call('POST', `/fees/reports/${r!.id}/confirm`);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ paidPaise: 150000 });
    expect(await reportsOf(A)).toHaveLength(0);
    expect(await receipts(A)).toBe(1);
    const due = (await A.call('GET', `/fees/dues?status=all&studentId=${s}&period=2026-10`)).body
      .dues[0];
    expect(due).toMatchObject({ status: 'paid' });
    const [pay] = (await h.db.pool.query('SELECT mode, note FROM payments WHERE student_id = ?', [
      s,
    ])) as unknown as [{ mode: string; note: string }[]];
    expect(pay[0]).toEqual({ mode: 'upi', note: 'Parent reported paying (UPI ref 412356789012)' });

    // the parent page now says nothing is pending
    expect((await h.app.inject({ method: 'GET', url: link(s) })).body).toContain(
      'Nothing is pending',
    );
    // confirming twice does nothing more
    expect((await A.call('POST', `/fees/reports/${r!.id}/confirm`)).status).toBe(404);
  });

  it('"Not received" closes the report and lets the parent report again', async () => {
    const s = await mkStudent(A);
    await report(s);
    const [r] = await reportsOf(A);
    expect((await A.call('POST', `/fees/reports/${r!.id}/reject`)).status).toBe(200);
    expect(await reportsOf(A)).toHaveLength(0);
    expect((await h.app.inject({ method: 'GET', url: link(s) })).body).toContain("I've paid");
    await report(s);
    expect(await reportsOf(A)).toHaveLength(1);
  });

  it('confirming after the tutor already recorded the payment just closes the report', async () => {
    const s = await mkStudent(A);
    await report(s);
    const due = (await A.call('GET', `/fees/dues?status=all&studentId=${s}&period=2026-10`)).body
      .dues[0];
    await A.call('POST', `/fees/dues/${due.id}/payments`, { amount: 150000, mode: 'cash' });
    const [r] = await reportsOf(A);
    const ok = await A.call('POST', `/fees/reports/${r!.id}/confirm`);
    expect(ok.body).toMatchObject({ paidPaise: 0 });
    expect(await reportsOf(A)).toHaveLength(0);
  });
});

describe('the link in fee reminders', () => {
  it('is a 4th value only when it is set', () => {
    const ctx = {
      parent: '',
      student: 'Riya',
      institute: 'Kiran',
      amount: '₹1,500',
      period: 'Oct 2026',
    };
    expect(varsFor('fee_reminder', ctx)).toHaveLength(3);
    expect(varsFor('fee_reminder', { ...ctx, paidLink: 'https://tutor.chalkpis.com/f/x' })).toEqual(
      ['Riya', '₹1,500 for Oct 2026', 'Kiran', 'https://tutor.chalkpis.com/f/x'],
    );
    expect(
      varsFor('fee_link', { ...ctx, link: 'https://pay', paidLink: 'https://f' }),
    ).toHaveLength(4);
    expect(varsFor('absent', { ...ctx, paidLink: 'https://f' })).toHaveLength(3);
  });
});
