/**
 * The same request sent twice (a double tap, or a retry after a timeout) must never do the work twice, and the
 * sign-in edge cases around it. The app sends an Idempotency-Key with every create and money request; endpoints
 * that are naturally safe (full payments, reversals, generate, attendance, staff, plan purchase) are safe even
 * without one.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../src/lib/ids.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const twice = async <T>(f: () => Promise<T>) => [await f(), await f()];
/** One user action: the same Idempotency-Key on every retry of it. */
const key = (k: string) => ({ 'idempotency-key': `test-key-${k}`.padEnd(20, '0') });
const together = <T>(f: () => Promise<T>) => Promise.all([f(), f()]);
const count = async (h: Harness, sql: string, args: unknown[]) => {
  const [rows] = (await h.db.pool.query(sql, args)) as unknown as [{ n: number }[]];
  return Number(rows[0]!.n);
};

describe('idempotency of mutating endpoints', () => {
  let h: Harness;
  let A: Tenant;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    h.provider.sent = [];
    A = await h.tenant('+919876543210', { institute: 'Alpha' });
  });

  const student = { name: 'Asha', parentPhone: '9876500001', monthlyFee: 1000 };
  const batch = {
    name: 'Maths 10',
    subject: 'Maths',
    days: ['mon'],
    startTime: '16:00',
    endTime: '17:00',
    defaultFee: 500,
  };
  async function dueFor() {
    const s = await A.call('POST', '/students', student);
    await A.call('POST', '/fees/generate', { period: '2026-10' });
    const d = await A.call('GET', `/fees/dues?studentId=${s.body.id}`);
    return { studentId: s.body.id as string, dueId: d.body.dues[0].id as string };
  }

  const students = () =>
    count(h, 'SELECT COUNT(*) n FROM students WHERE institute_id = ?', [A.instituteId]);
  it('a retried add-student (same key) creates one student and replays the same answer', async () => {
    const r = await twice(() => A.call('POST', '/students', student, key('s1')));
    expect(r.map((x) => x.status)).toEqual([201, 201]);
    expect(r[1]!.body).toEqual(r[0]!.body);
    expect(await students()).toBe(1);
  });
  it('a double tap (same key, at the same moment) creates one student; the other is told to wait', async () => {
    const r = await together(() => A.call('POST', '/students', student, key('s2')));
    expect(await students()).toBe(1);
    expect(r.map((x) => x.status).sort()).toEqual(
      r.some((x) => x.status === 409) ? [201, 409] : [201, 201],
    );
    const busy = r.find((x) => x.status === 409);
    if (busy) expect(busy.body.error).toBe('request_in_progress');
  });
  it('a new action (a new key) still adds a second student with the same details', async () => {
    await A.call('POST', '/students', student, key('s3'));
    await A.call('POST', '/students', student, key('s4'));
    expect(await students()).toBe(2);
  });
  it('a key is tied to its person and its route', async () => {
    const B = await h.tenant('+919876543299', { institute: 'Beta' });
    await A.call('POST', '/students', student, key('s5'));
    expect((await B.call('POST', '/students', student, key('s5'))).status).toBe(201); // B's own key space
    expect((await A.call('POST', '/batches', batch, key('s5'))).status).toBe(422);
    expect(
      (await A.call('POST', '/students', student, { 'idempotency-key': 'short' })).status,
    ).toBe(400);
  });
  it('a refused request (bad input) is replayed as refused; a failure that may pass later is not stored', async () => {
    const bad = await twice(() => A.call('POST', '/students', { name: '' }, key('s6')));
    expect(bad.map((x) => x.status)).toEqual([400, 400]);
    await h.db.pool.query("UPDATE subscriptions SET status = 'expired' WHERE institute_id = ?", [
      A.instituteId,
    ]);
    const blocked = await A.call('POST', '/students', student, key('s7'));
    expect(blocked.status).toBe(402);
    await h.db.pool.query("UPDATE subscriptions SET status = 'active' WHERE institute_id = ?", [
      A.instituteId,
    ]);
    expect((await A.call('POST', '/students', student, key('s7'))).status).toBe(201);
  });
  it('a retried add-batch (same key) creates one batch', async () => {
    await together(() => A.call('POST', '/batches', batch, key('b1')));
    expect(
      await count(h, 'SELECT COUNT(*) n FROM batches WHERE institute_id = ?', [A.instituteId]),
    ).toBe(1);
  });

  it('a retried partial payment (same key) records one payment, with the same receipt number', async () => {
    const { dueId } = await dueFor();
    const pay = () =>
      A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' }, key('p1'));
    const r = await twice(pay);
    expect(r.map((x) => x.status)).toEqual([201, 201]);
    expect(r[1]!.body).toEqual(r[0]!.body);
    expect(await count(h, 'SELECT COUNT(*) n FROM payments WHERE due_id = ?', [dueId])).toBe(1);
  });
  it('a double-tapped partial payment (same key, concurrent) records one payment', async () => {
    const { dueId } = await dueFor();
    await together(() =>
      A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' }, key('p2')),
    );
    expect(await count(h, 'SELECT COUNT(*) n FROM payments WHERE due_id = ?', [dueId])).toBe(1);
  });
  it('two real partial payments (two keys) are both recorded', async () => {
    const { dueId } = await dueFor();
    await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' }, key('p3'));
    await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' }, key('p4'));
    expect(await count(h, 'SELECT COUNT(*) n FROM payments WHERE due_id = ?', [dueId])).toBe(2);
  });
  it('a full payment sent twice (concurrent): the second is refused, never overpays', async () => {
    const { dueId } = await dueFor();
    const r = await together(() =>
      A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 1000, mode: 'cash' }),
    );
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(await count(h, 'SELECT COUNT(*) n FROM payments WHERE due_id = ?', [dueId])).toBe(1);
  });
  it('a duplicated partial payment queues one WhatsApp receipt to the parent', async () => {
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
    const { dueId } = await dueFor();
    await twice(() =>
      A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' }, key('p5')),
    );
    expect(
      await count(
        h,
        "SELECT COUNT(*) n FROM messages WHERE institute_id = ? AND type = 'payment_received'",
        [A.instituteId],
      ),
    ).toBe(1);
  });

  it('POST /fees/advance sent twice: second is refused, months paid once', async () => {
    const s = await A.call('POST', '/students', student);
    const body = { studentId: s.body.id, months: ['2026-10', '2026-11'], mode: 'upi' };
    const r = await together(() => A.call('POST', '/fees/advance', body));
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(
      await count(h, 'SELECT COUNT(*) n FROM payments WHERE student_id = ?', [s.body.id]),
    ).toBe(2);
  });

  it('POST /fees/payments/:id/reverse sent twice (sequential and concurrent) reverses once', async () => {
    const { dueId } = await dueFor();
    const p1 = await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 300, mode: 'cash' });
    const p2 = await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 200, mode: 'cash' });
    const seq = await twice(() => A.call('POST', `/fees/payments/${p1.body.paymentId}/reverse`));
    expect(seq.map((x) => x.status)).toEqual([200, 409]);
    const con = await together(() => A.call('POST', `/fees/payments/${p2.body.paymentId}/reverse`));
    expect(con.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(
      await count(h, 'SELECT COUNT(*) n FROM payments WHERE due_id = ? AND amount < 0', [dueId]),
    ).toBe(2);
    const d = await A.call('GET', `/fees/dues/${dueId}`);
    expect(d.body.paid).toBe(0);
  });

  it('POST /fees/charges sent twice creates one charge', async () => {
    const s = await A.call('POST', '/students', student);
    const body = { studentId: s.body.id, description: 'Books', amount: 250, dueDate: '2026-10-20' };
    await together(() => A.call('POST', '/fees/charges', body, key('c1')));
    expect(
      await count(h, "SELECT COUNT(*) n FROM fee_dues WHERE student_id = ? AND kind = 'charge'", [
        s.body.id,
      ]),
    ).toBe(1);
  });

  it('POST /fees/generate twice (concurrent) creates each due once', async () => {
    await A.call('POST', '/students', student);
    const r = await together(() => A.call('POST', '/fees/generate', { period: '2026-10' }));
    expect(r.map((x) => x.status)).toEqual([200, 200]);
    expect(
      await count(h, 'SELECT COUNT(*) n FROM fee_dues WHERE institute_id = ?', [A.instituteId]),
    ).toBe(1);
  });

  it('PUT /attendance twice (concurrent) keeps one day and one absent message key', async () => {
    const b = await A.call('POST', '/batches', batch);
    const s = await A.call('POST', '/students', { ...student, batchIds: [b.body.id] });
    const body = { batchId: b.body.id, date: '2026-10-08', marks: { [s.body.id]: 'A' } };
    const r = await together(() => A.call('PUT', '/attendance', body));
    expect(r.map((x) => x.status)).toEqual([200, 200]);
    expect(
      await count(h, 'SELECT COUNT(*) n FROM attendance_days WHERE batch_id = ?', [b.body.id]),
    ).toBe(1);
  });

  it('POST /tasks sent twice creates one task', async () => {
    await twice(() => A.call('POST', '/tasks', { title: 'Call parents' }, key('t1')));
    expect(
      await count(h, 'SELECT COUNT(*) n FROM tasks WHERE institute_id = ?', [A.instituteId]),
    ).toBe(1);
  });

  it('POST /staff twice (concurrent): one membership, second 409', async () => {
    const r = await together(() =>
      A.call('POST', '/staff', { phone: '9000011111', name: 'Helper' }),
    );
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    expect(
      await count(
        h,
        "SELECT COUNT(*) n FROM memberships WHERE institute_id = ? AND role = 'staff'",
        [A.instituteId],
      ),
    ).toBe(1);
  });

  it('POST /institutes twice (concurrent) for a new user: one institute, no 500', async () => {
    const userId = newId();
    await h.db.pool.query('INSERT INTO users (id, phone) VALUES (?, ?)', [userId, '+919111122222']);
    const U = h.login(userId, '');
    const body = { tutorName: 'Ravi', instituteName: 'Ravi Classes' };
    const r = await together(() => U.call('POST', '/institutes', body));
    expect(r.map((x) => x.status).sort()).toEqual([200, 201]);
    expect(
      await count(h, 'SELECT COUNT(*) n FROM institutes WHERE owner_user_id = ?', [userId]),
    ).toBe(1);
  });

  it('POST /billing/links twice creates one open order (owner cannot be charged twice)', async () => {
    await together(() => A.call('POST', '/billing/links', { planId: 'starter' }));
    expect(
      await count(h, 'SELECT COUNT(*) n FROM billing_orders WHERE institute_id = ?', [
        A.instituteId,
      ]),
    ).toBe(1);
  });

  it('the same paid order applied twice (concurrent) extends the plan once', async () => {
    const o = await A.call('POST', '/billing/links', { planId: 'starter' });
    const r = await together(() =>
      A.call('POST', '/billing/mock/complete', { orderId: o.body.orderId }),
    );
    expect(r.map((x) => x.body.result).sort()).toEqual(['applied', 'duplicate']);
    expect(
      await count(
        h,
        "SELECT COUNT(*) n FROM billing_events WHERE institute_id = ? AND status = 'applied'",
        [A.instituteId],
      ),
    ).toBe(1);
  });

  it('send-receipt twice: second refused (one WhatsApp)', async () => {
    const { dueId } = await dueFor();
    const p = await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' });
    const r = await together(() =>
      A.call('POST', `/fees/payments/${p.body.paymentId}/send-receipt`),
    );
    expect(r.map((x) => x.status).sort()).toEqual([202, 409]);
  });

  it('receipts for two different payments both go out, even a minute apart', async () => {
    const { dueId } = await dueFor();
    const p1 = await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 300, mode: 'cash' });
    const p2 = await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 200, mode: 'cash' });
    expect((await A.call('POST', `/fees/payments/${p1.body.paymentId}/send-receipt`)).status).toBe(
      202,
    );
    expect((await A.call('POST', `/fees/payments/${p2.body.paymentId}/send-receipt`)).status).toBe(
      202,
    );
  });

  it('send-receipt double tap that straddles a 10-minute bucket boundary sends once', async () => {
    const { dueId } = await dueFor();
    const p = await A.call('POST', `/fees/dues/${dueId}/payments`, { amount: 400, mode: 'cash' });
    h.clock.now = new Date('2026-10-08T06:09:59.500Z');
    const a = await A.call('POST', `/fees/payments/${p.body.paymentId}/send-receipt`);
    h.clock.now = new Date('2026-10-08T06:10:00.200Z');
    const b = await A.call('POST', `/fees/payments/${p.body.paymentId}/send-receipt`);
    expect([a.status, b.status]).toEqual([202, 409]);
  });

  it('remind twice: second refused', async () => {
    const { studentId } = await dueFor();
    const r = await twice(() => A.call('POST', `/students/${studentId}/remind`));
    expect(r.map((x) => x.status)).toEqual([202, 409]);
  });

  it('parent-link with sendWhatsApp twice: no orphan link created by the refused retry', async () => {
    const s = await A.call('POST', '/students', student);
    const r = await twice(() =>
      A.call('POST', `/students/${s.body.id}/parent-link`, { sendWhatsApp: true }),
    );
    expect(r.map((x) => x.status)).toEqual([201, 409]);
    expect(
      await count(h, 'SELECT COUNT(*) n FROM parent_links WHERE student_id = ? AND revoked = 0', [
        s.body.id,
      ]),
    ).toBe(1);
  });
});

describe('sign-in edge cases', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    h.provider.sent = [];
  });
  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
    h.app.inject({ method: 'POST', url, payload: payload as object, headers });
  const lastWa = () => h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
  const PHONE = '9876543210';

  async function otpLogin(phone = PHONE) {
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    await post('/auth/otp/request', { phone });
    return post('/auth/otp/verify', { phone, code: lastWa() });
  }

  it('the same OTP verified twice concurrently: exactly one session', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const code = lastWa();
    const r = await together(() => post('/auth/otp/verify', { phone: PHONE, code }));
    expect(r.map((x) => x.statusCode).sort()).toEqual([200, 401]);
    expect(await count(h, 'SELECT COUNT(*) n FROM users WHERE phone = ?', ['+919876543210'])).toBe(
      1,
    );
  });

  it('a used OTP cannot be reused', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const code = lastWa();
    expect((await post('/auth/otp/verify', { phone: PHONE, code })).statusCode).toBe(200);
    expect((await post('/auth/otp/verify', { phone: PHONE, code })).statusCode).toBe(401);
  });

  it('a blocked user cannot refresh their session', async () => {
    const v = await otpLogin();
    await h.db.pool.query('UPDATE users SET blocked_at = ? WHERE id = ?', [
      h.clock.now,
      v.json().user.id,
    ]);
    const r = await post('/auth/refresh', { refreshToken: v.json().refreshToken });
    expect(r.statusCode).not.toBe(200);
  });

  it('a refresh retried inside the grace window (lost response) keeps the person signed in', async () => {
    const v = await otpLogin();
    const rt = v.json().refreshToken;
    const r = await twice(() => post('/auth/refresh', { refreshToken: rt }));
    expect(r.map((x) => x.statusCode)).toEqual([200, 200]);
    // the retry's new pair works too
    expect(
      (await post('/auth/refresh', { refreshToken: r[1]!.json().refreshToken })).statusCode,
    ).toBe(200);
  });

  it('the review number signs in with its fixed code and no WhatsApp message is sent', async () => {
    const R = await startHarness({ REVIEW_PHONE: '+919999900001', REVIEW_CODE: '424242' }, {});
    try {
      R.provider.sent = [];
      const req = await R.app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: { phone: '9999900001' },
      });
      expect(req.statusCode).toBe(200);
      expect(R.provider.sent).toHaveLength(0);
      const bad = await R.app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { phone: '9999900001', code: '000000' },
      });
      expect(bad.statusCode).toBe(401);
      const ok = await R.app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { phone: '9999900001', code: '424242' },
      });
      expect(ok.statusCode).toBe(200);
      // reviewers share the number, wait and retry: later, after many tries and without asking for a code again,
      // the fixed code still works
      R.clock.now = new Date(R.clock.now.getTime() + 3 * 3_600_000);
      for (let i = 0; i < 6; i++)
        await R.app.inject({
          method: 'POST',
          url: '/auth/otp/verify',
          payload: { phone: '9999900001', code: '111111' },
        });
      for (let i = 0; i < 7; i++)
        expect(
          (
            await R.app.inject({
              method: 'POST',
              url: '/auth/otp/request',
              payload: { phone: '9999900001' },
            })
          ).statusCode,
        ).toBe(200);
      const later = await R.app.inject({
        method: 'POST',
        url: '/auth/otp/verify',
        payload: { phone: '+91 99999 00001', code: '424242' },
      });
      expect(later.statusCode).toBe(200);
      expect(R.provider.sent).toHaveLength(0);
      // any other number still gets a real, random code by WhatsApp
      await R.app.inject({
        method: 'POST',
        url: '/auth/otp/request',
        payload: { phone: '9876500077' },
      });
      expect(R.provider.sent).toHaveLength(1);
      expect(R.provider.sent[0]!.vars[0]).not.toBe('424242');
    } finally {
      await R.close();
    }
  });
});

describe('per-IP limits behind TRUST_PROXY=true (production setting)', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ TRUST_PROXY: true });
  });
  afterAll(() => h.close());

  it('control: 21 verify attempts from one address hit the 20/10min limit', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 21; i++)
      codes.push(
        (
          await h.app.inject({
            method: 'POST',
            url: '/auth/otp/verify',
            payload: { phone: '9876543210', code: '123456' },
            headers: { 'x-forwarded-for': '203.0.113.7' },
          })
        ).statusCode,
      );
    expect(codes).toContain(429);
  });

  it('a spoofed X-Forwarded-For per request does not reset the per-IP limit', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 30; i++)
      codes.push(
        (
          await h.app.inject({
            method: 'POST',
            url: '/auth/otp/verify',
            payload: { phone: '9876543211', code: '123456' },
            headers: { 'x-forwarded-for': `198.51.100.${i}, 10.0.0.1` },
          })
        ).statusCode,
      );
    expect(codes).toContain(429);
  });
});
