import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signToken } from '../src/lib/jwt.js';
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
const TODAY = '2026-10-08';
const batch = (over = {}) => ({
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['thu'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
  ...over,
});
const student = (over = {}) => ({
  name: 'Asha Rao',
  parentPhone: '9876543210',
  monthlyFee: 100000,
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const dueOf = async (t: Tenant, studentId: string, period = '2026-10') =>
  (await t.call('GET', `/fees/dues?status=all&studentId=${studentId}&period=${period}`)).body
    .dues[0] as { id: string; [k: string]: unknown };
const pay = (t: Tenant, dueId: string, amount: number, extra = {}) =>
  t.call('POST', `/fees/dues/${dueId}/payments`, { amount, mode: 'cash', ...extra });
const gen = (t: Tenant, period?: string) =>
  t.call('POST', '/fees/generate', period ? { period } : {});

describe('attendance', () => {
  it('saves and reads a day; saving again replaces it completely', async () => {
    const b = await mk(A, '/batches', batch());
    const s1 = await mk(A, '/students', student({ batchIds: [b] }));
    const s2 = await mk(A, '/students', student({ name: 'Bala K', batchIds: [b] }));
    expect((await A.call('GET', `/attendance?batchId=${b}&date=${TODAY}`)).body).toMatchObject({
      saved: false,
      marks: {},
    });
    expect(
      (
        await A.call('PUT', '/attendance', {
          batchId: b,
          date: TODAY,
          marks: { [s1]: 'P', [s2]: 'A' },
        })
      ).status,
    ).toBe(200);
    expect((await A.call('GET', `/attendance?batchId=${b}&date=${TODAY}`)).body).toMatchObject({
      saved: true,
      holiday: null,
      marks: { [s1]: 'P', [s2]: 'A' },
    });
    await A.call('PUT', '/attendance', { batchId: b, date: TODAY, marks: { [s1]: 'L' } });
    expect((await A.call('GET', `/attendance?batchId=${b}&date=${TODAY}`)).body.marks).toEqual({
      [s1]: 'L',
    }); // s2's mark did not linger
    await A.call('PUT', '/attendance', {
      batchId: b,
      date: TODAY,
      holiday: 'cancelled',
      marks: { [s1]: 'A' },
    });
    expect((await A.call('GET', `/attendance?batchId=${b}&date=${TODAY}`)).body).toMatchObject({
      holiday: 'cancelled',
      marks: {},
    });
  });

  it('validates input and refuses future days, unknown batches and unknown students', async () => {
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student());
    const put = (body: unknown) => A.call('PUT', '/attendance', body);
    expect((await put({ batchId: b, date: '2026-10-09', marks: {} })).body.error).toBe(
      'future_date',
    );
    expect((await put({ batchId: b, date: '2026-02-31', marks: {} })).status).toBe(400);
    expect((await put({ batchId: b, date: TODAY, marks: { [s]: 'X' } })).status).toBe(400);
    expect((await put({ batchId: b, date: TODAY, marks: { 'not-a-uuid': 'P' } })).status).toBe(400);
    expect(
      (await put({ batchId: '00000000-0000-4000-8000-000000000000', date: TODAY, marks: {} })).body
        .error,
    ).toBe('unknown_batch');
    expect(
      (
        await put({
          batchId: b,
          date: TODAY,
          marks: { '00000000-0000-4000-8000-000000000000': 'P' },
        })
      ).body.error,
    ).toBe('unknown_student');
  });

  it('simultaneous saves of one day leave exactly one day row', async () => {
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student());
    const rs = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        A.call('PUT', '/attendance', {
          batchId: b,
          date: TODAY,
          marks: { [s]: i % 2 ? 'A' : 'P' },
        }),
      ),
    );
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const [[n]] = (await h.db.pool.query(
      'SELECT COUNT(*) AS n FROM attendance_days WHERE batch_id = ?',
      [b],
    )) as unknown as [[{ n: number }]];
    expect(Number(n.n)).toBe(1);
  });

  it('range, student history and the report (late counts as attended, holidays are ignored)', async () => {
    const b = await mk(A, '/batches', batch());
    const s1 = await mk(A, '/students', student({ batchIds: [b] }));
    const s2 = await mk(A, '/students', student({ name: 'Bala K', batchIds: [b] }));
    const days: [string, Record<string, string>, string?][] = [
      ['2026-10-01', { [s1]: 'P', [s2]: 'A' }],
      ['2026-10-02', { [s1]: 'L', [s2]: 'A' }],
      ['2026-10-03', { [s1]: 'A', [s2]: 'P' }],
      ['2026-10-04', {}, 'holiday'],
    ];
    for (const [date, marks, holiday] of days)
      await A.call('PUT', '/attendance', {
        batchId: b,
        date,
        marks,
        ...(holiday ? { holiday } : {}),
      });
    const range = (
      await A.call('GET', `/attendance/range?from=2026-10-01&to=2026-10-31&batchId=${b}`)
    ).body.days;
    expect(range.map((d: { date: string }) => d.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    const r = (await A.call('GET', `/attendance/report?from=2026-10-01&to=2026-10-31`)).body;
    expect(r.overall).toMatchObject({
      present: 2,
      late: 1,
      absent: 3,
      total: 6,
      pct: 50,
      sessions: 3,
      holidays: 1,
    });
    const asha = r.students.find((x: { name: string }) => x.name === 'Asha Rao');
    expect(asha).toMatchObject({ present: 1, late: 1, absent: 1, pct: 66.7 });
    expect(r.low.map((x: { name: string }) => x.name)).toEqual(['Bala K', 'Asha Rao']); // worst first, both under 75%
    const hist = (await A.call('GET', `/students/${s1}/attendance?from=2026-10-01&to=2026-10-31`))
      .body;
    expect(hist.days.map((d: { date: string; mark: string }) => `${d.date}${d.mark}`)).toEqual([
      '2026-10-03A',
      '2026-10-02L',
      '2026-10-01P',
    ]);
    expect(
      (await A.call('GET', '/attendance/range?from=2026-01-01&to=2026-12-31')).body.error,
    ).toBe('range_too_long');
    expect((await A.call('GET', '/attendance/range?from=2026-10-05&to=2026-10-01')).status).toBe(
      400,
    );
  });

  it('nothing to measure gives null, not a crash', async () => {
    expect(
      (await A.call('GET', '/attendance/report?from=2026-10-01&to=2026-10-31')).body.overall,
    ).toMatchObject({ total: 0, pct: null, sessions: 0 });
  });
});

describe('fee dues', () => {
  it('creates the right dues once, and again does nothing', async () => {
    await mk(A, '/students', student({ name: 'Monthly Kid', dueDay: 31 }));
    await mk(
      A,
      '/students',
      student({ name: 'Quarterly Kid', feeCycle: 'quarterly', monthlyFee: 50000 }),
    );
    await mk(A, '/students', student({ name: 'Free Kid', monthlyFee: 0 }));
    const gone = await mk(A, '/students', student({ name: 'Left Kid' }));
    await A.call('POST', `/students/${gone}/deactivate`);
    const r = await gen(A, '2026-11');
    expect(r.body.created).toBe(1); // only the monthly kid: the quarterly kid joined in October, so is next due in January
  });

  it('quarterly dues fall in the joining month and every third month after', async () => {
    const q = await mk(A, '/students', student({ feeCycle: 'quarterly', monthlyFee: 50000 }));
    expect((await gen(A, '2026-10')).body.created).toBe(1);
    expect((await gen(A, '2026-11')).body.created).toBe(0);
    expect((await gen(A, '2026-12')).body.created).toBe(0);
    expect((await gen(A, '2027-01')).body.created).toBe(1);
    expect(await dueOf(A, q, '2026-10')).toMatchObject({
      amount: 150000,
      description: 'Quarterly fee',
    });
  });

  it('monthly dues carry the discount, clamp the due day to the month, and never duplicate', async () => {
    const s = await mk(A, '/students', student({ dueDay: 31, discount: 20000 }));
    expect((await gen(A, '2026-11')).body.created).toBe(1);
    expect(await dueOf(A, s, '2026-11')).toMatchObject({
      amount: 100000,
      discount: 20000,
      net: 80000,
      dueDate: '2026-11-30',
      status: 'pending',
      description: 'Monthly fee',
    });
    expect((await gen(A, '2026-11')).body.created).toBe(0);
    const both = await Promise.all([gen(A, '2026-12'), gen(A, '2026-12'), gen(A, '2026-12')]);
    expect(both.reduce((t, r) => t + r.body.created, 0)).toBe(1);
    expect((await A.call('GET', '/fees/dues?status=all')).body.dues).toHaveLength(2);
  });

  it('one-time fee is a single due; a student who has not joined yet gets nothing', async () => {
    await mk(A, '/students', student({ feeCycle: 'one-time' }));
    expect((await gen(A, '2026-09')).body.created).toBe(0); // before joining
    expect((await gen(A, '2026-10')).body.created).toBe(1);
    expect((await gen(A, '2026-11')).body.created).toBe(0);
  });

  it('a discount as large as the fee makes a due that is already paid', async () => {
    const s = await mk(A, '/students', student({ discount: 100000 }));
    await gen(A, '2026-10');
    expect(await dueOf(A, s)).toMatchObject({ status: 'paid', outstanding: 0 });
  });

  it('rejects a bad period', async () => {
    for (const period of ['2026-13', '26-10', 'x', '2026-1'])
      expect((await gen(A, period)).status).toBe(400);
  });
});

describe('payments', () => {
  let s: string;
  let due: { id: string };
  beforeEach(async () => {
    s = await mk(A, '/students', student());
    await gen(A);
    due = await dueOf(A, s);
  });

  it('partial then full payment, with receipt numbers and balances', async () => {
    const p1 = await pay(A, due.id, 40000, { note: 'first half' });
    expect([p1.status, p1.body]).toMatchObject([
      201,
      { receiptNo: 'TD-00001', balanceAfter: 60000, status: 'partial' },
    ]);
    const p2 = await pay(A, due.id, 60000, { mode: 'upi' });
    expect(p2.body).toMatchObject({ receiptNo: 'TD-00002', balanceAfter: 0, status: 'paid' });
    expect(await dueOf(A, s)).toMatchObject({ paid: 100000, outstanding: 0, status: 'paid' });
    const r = (await A.call('GET', `/fees/payments/${p1.body.paymentId}`)).body;
    expect(r).toMatchObject({
      amount: 40000,
      mode: 'cash',
      receiptNo: 'TD-00001',
      studentName: 'Asha Rao',
      dueDescription: 'Monthly fee',
      note: 'first half',
      paidOn: TODAY,
      reversed: false,
      institute: { name: 'Alpha' },
    });
  });

  it('refuses overpaying, bad amounts, future dates, and paying a waived due', async () => {
    expect((await pay(A, due.id, 100001)).body.error).toBe('exceeds_balance');
    for (const amount of [0, -5, 1.5, '100'])
      expect((await pay(A, due.id, amount as number)).status).toBe(400);
    expect((await pay(A, due.id, 100, { paidOn: '2026-10-09' })).body.error).toBe('bad_date');
    expect((await pay(A, due.id, 100, { paidOn: '2026-02-31' })).status).toBe(400);
    await A.call('POST', `/fees/dues/${due.id}/waive`, { waived: true });
    expect((await pay(A, due.id, 100)).body.error).toBe('due_waived');
  });

  it('a payment dated on another day is stamped at noon Indian time on that day', async () => {
    const p = await pay(A, due.id, 100, { paidOn: '2026-10-05' });
    const r = (await A.call('GET', `/fees/payments/${p.body.paymentId}`)).body;
    expect([r.paidAt, r.paidOn]).toEqual(['2026-10-05T06:30:00.000Z', '2026-10-05']);
  });

  it('simultaneous payments never share a receipt number', async () => {
    const ids = [due.id];
    for (let i = 0; i < 7; i++) {
      const sid = await mk(A, '/students', student({ name: `Kid ${i}` }));
      await gen(A);
      ids.push((await dueOf(A, sid)).id);
    }
    const rs = await Promise.all(ids.map((id) => pay(A, id, 1000)));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    const nos = rs.map((r) => r.body.receiptNo as string).sort();
    expect(new Set(nos).size).toBe(8);
    expect(nos).toEqual(
      Array.from({ length: 8 }, (_, i) => `TD-${String(i + 1).padStart(5, '0')}`),
    );
    const [[inst]] = (await h.db.pool.query(
      'SELECT next_receipt_no AS n FROM institutes WHERE id = ?',
      [A.instituteId],
    )) as unknown as [[{ n: number }]];
    expect(Number(inst.n)).toBe(9);
  });

  it('simultaneous payments on one due can never total more than is owed', async () => {
    const rs = await Promise.all(Array.from({ length: 6 }, () => pay(A, due.id, 40000)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(2); // 40k + 40k fit; the third would be 120k
    expect(
      rs.filter((r) => r.status === 409).every((r) => r.body.error === 'exceeds_balance'),
    ).toBe(true);
    expect(await dueOf(A, s)).toMatchObject({ paid: 80000, outstanding: 20000, status: 'partial' });
  });

  it('a failed payment burns no receipt number', async () => {
    await pay(A, due.id, 999999);
    expect((await pay(A, due.id, 100)).body.receiptNo).toBe('TD-00001');
  });

  it('reversal puts the money back, shows on the ledger, and can happen only once', async () => {
    const p = await pay(A, due.id, 100000);
    expect((await dueOf(A, s)).status).toBe('paid');
    const rev = await A.call('POST', `/fees/payments/${p.body.paymentId}/reverse`);
    expect([rev.status, rev.body.status]).toEqual([200, 'pending']);
    expect(await dueOf(A, s)).toMatchObject({ paid: 0, outstanding: 100000, status: 'pending' });
    const ledger = (await A.call('GET', `/fees/payments?studentId=${s}`)).body.payments;
    expect(
      ledger.map((x: { amount: number }) => x.amount).sort((a: number, b: number) => a - b),
    ).toEqual([-100000, 100000]);
    expect(ledger.find((x: { amount: number }) => x.amount === 100000).reversed).toBe(true);
    expect((await A.call('POST', `/fees/payments/${p.body.paymentId}/reverse`)).body.error).toBe(
      'already_reversed',
    );
    expect((await A.call('POST', `/fees/payments/${rev.body.reversalId}/reverse`)).body.error).toBe(
      'not_reversible',
    );
    expect((await pay(A, due.id, 100000)).status).toBe(201); // can be paid again after the reversal
  });

  it('two simultaneous reversals of one payment: one wins', async () => {
    const p = await pay(A, due.id, 50000);
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => A.call('POST', `/fees/payments/${p.body.paymentId}/reverse`)),
    );
    expect(rs.filter((r) => r.status === 200)).toHaveLength(1);
    expect(
      rs.filter((r) => r.status === 409).every((r) => r.body.error === 'already_reversed'),
    ).toBe(true);
    expect(await dueOf(A, s)).toMatchObject({ paid: 0 });
  });

  it('the ledger can be filtered by day and paged', async () => {
    await pay(A, due.id, 100, { paidOn: '2026-10-02' });
    await pay(A, due.id, 200, { paidOn: '2026-10-05' });
    await pay(A, due.id, 300);
    const q = async (qs: string) =>
      (await A.call('GET', `/fees/payments?${qs}`)).body.payments.map(
        (p: { amount: number }) => p.amount,
      );
    expect(await q('')).toEqual([300, 200, 100]);
    expect(await q('from=2026-10-03&to=2026-10-05')).toEqual([200]);
    expect(await q('from=2026-10-05&to=2026-10-05')).toEqual([200]);
    expect(await q('limit=1&offset=1')).toEqual([200]);
  });
});

describe('discount, waive, charges', () => {
  let s: string;
  let due: { id: string };
  beforeEach(async () => {
    s = await mk(A, '/students', student());
    await gen(A);
    due = await dueOf(A, s);
  });
  const patchDiscount = (discount: number) =>
    A.call('PATCH', `/fees/dues/${due.id}/discount`, { discount });

  it('discount changes what is owed, but never below what is already paid', async () => {
    await pay(A, due.id, 60000);
    expect((await patchDiscount(50000)).body.error).toBe('discount_too_big'); // net 50k < paid 60k
    expect((await patchDiscount(40000)).status).toBe(200); // net 60k == paid 60k
    expect(await dueOf(A, s)).toMatchObject({
      discount: 40000,
      net: 60000,
      outstanding: 0,
      status: 'paid',
    });
    expect((await patchDiscount(200000)).body.error).toBe('discount_too_big');
    expect((await patchDiscount(-1)).status).toBe(400);
    expect((await patchDiscount(1.5)).status).toBe(400);
    expect((await patchDiscount(0)).status).toBe(200);
    expect(await dueOf(A, s)).toMatchObject({ outstanding: 40000, status: 'partial' });
  });

  it('waive forgives the balance; un-waive recomputes from the money', async () => {
    await pay(A, due.id, 30000);
    await A.call('POST', `/fees/dues/${due.id}/waive`, { waived: true, note: 'scholarship' });
    expect(await dueOf(A, s)).toMatchObject({
      status: 'waived',
      outstanding: 0,
      waivedNote: 'scholarship',
    });
    expect((await A.call('GET', '/fees/overview')).body.students).toEqual([]);
    await A.call('POST', `/fees/dues/${due.id}/waive`, { waived: false });
    expect(await dueOf(A, s)).toMatchObject({
      status: 'partial',
      outstanding: 70000,
      waivedNote: '',
    });
  });

  it('a one-off charge is its own due', async () => {
    const id = await mk(A, '/fees/charges', {
      studentId: s,
      description: 'Admission fee',
      amount: 25000,
      dueDate: '2026-10-20',
    });
    const dues = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues;
    expect(dues).toHaveLength(2);
    expect(dues.find((d: { id: string }) => d.id === id)).toMatchObject({
      kind: 'charge',
      amount: 25000,
      dueDate: '2026-10-20',
      description: 'Admission fee',
    });
    await mk(A, '/fees/charges', {
      studentId: s,
      description: 'Books',
      amount: 5000,
      dueDate: '2026-10-20',
    }); // charges may repeat
    expect(
      (
        await A.call('POST', '/fees/charges', {
          studentId: s,
          description: '',
          amount: 5,
          dueDate: '2026-10-20',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await A.call('POST', '/fees/charges', {
          studentId: s,
          description: 'x',
          amount: 0,
          dueDate: '2026-10-20',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await A.call('POST', '/fees/charges', {
          studentId: '00000000-0000-4000-8000-000000000000',
          description: 'x',
          amount: 5,
          dueDate: '2026-10-20',
        })
      ).body.error,
    ).toBe('unknown_student');
  });
});

describe('overview, dashboard and fee report', () => {
  it('overview groups per student: overdue first, then oldest, then biggest', async () => {
    const early = await mk(A, '/students', student({ name: 'Early Kid', dueDay: 1 }));
    const bigLate = await mk(
      A,
      '/students',
      student({ name: 'Big Late', dueDay: 5, monthlyFee: 300000 }),
    );
    const notYet = await mk(A, '/students', student({ name: 'Not Yet', dueDay: 25 }));
    const paidUp = await mk(A, '/students', student({ name: 'Paid Up' }));
    await gen(A);
    await pay(A, (await dueOf(A, paidUp)).id, 100000);
    await pay(A, (await dueOf(A, early)).id, 30000);
    const o = (await A.call('GET', '/fees/overview')).body;
    expect(o.students.map((x: { name: string }) => x.name)).toEqual([
      'Early Kid',
      'Big Late',
      'Not Yet',
    ]);
    expect(o.students[0]).toMatchObject({
      studentId: early,
      outstanding: 70000,
      overdueAmount: 70000,
      oldestDueDate: '2026-10-01',
      overdue: true,
    });
    expect(o.students[1]).toMatchObject({ studentId: bigLate, outstanding: 300000 });
    expect(o.students[2]).toMatchObject({ studentId: notYet, overdue: false, overdueAmount: 0 });
    expect(o.totals).toEqual({
      outstanding: 470000,
      overdueAmount: 370000,
      students: 3,
      overdueStudents: 2,
    });
  });

  it("dashboard shows today's classes, attendance marked, and money", async () => {
    const thu = await mk(A, '/batches', batch({ name: 'Thursday' }));
    await mk(A, '/batches', batch({ name: 'Friday', days: ['fri'] }));
    const s = await mk(A, '/students', student({ batchIds: [thu] }));
    await gen(A);
    await pay(A, (await dueOf(A, s)).id, 40000);
    await A.call('PUT', '/attendance', { batchId: thu, date: TODAY, marks: { [s]: 'P' } });
    const d = (await A.call('GET', '/dashboard')).body;
    expect(d).toMatchObject({ today: TODAY, activeStudents: 1, activeBatches: 2 });
    expect(d.todayBatches).toEqual([
      {
        id: thu,
        name: 'Thursday',
        subject: 'Maths',
        startTime: '17:00',
        endTime: '18:00',
        studentCount: 1,
        marked: true,
        holiday: null,
      },
    ]);
    expect(d.fees).toEqual({
      collectedThisMonth: 40000,
      outstanding: 60000,
      overdueAmount: 60000,
      studentsOwing: 1,
      overdueStudents: 1,
    });
    expect(d.attendanceLast30Days).toMatchObject({ present: 1, total: 1, pct: 100 });
  });

  it('collected this month nets out reversals and ignores other months', async () => {
    const s = await mk(A, '/students', student());
    await gen(A);
    const due = await dueOf(A, s);
    await pay(A, due.id, 20000, { paidOn: '2026-10-01' });
    const p2 = await pay(A, due.id, 30000);
    await A.call('POST', `/fees/payments/${p2.body.paymentId}/reverse`);
    await h.db.pool.query(
      "UPDATE payments SET paid_at = '2026-09-30 17:00:00' WHERE institute_id = ? AND amount = 20000",
      [A.instituteId],
    ); // 22:30 IST on 30 Sep
    expect((await A.call('GET', '/dashboard')).body.fees.collectedThisMonth).toBe(0);
    await h.db.pool.query(
      "UPDATE payments SET paid_at = '2026-09-30 18:30:00' WHERE institute_id = ? AND amount = 20000",
      [A.instituteId],
    ); // exactly 00:00 IST on 1 Oct
    expect((await A.call('GET', '/dashboard')).body.fees.collectedThisMonth).toBe(20000);
  });

  it('fee report: by mode and by day (net of reversals), plus what was billed', async () => {
    const s = await mk(A, '/students', student());
    await gen(A);
    const due = await dueOf(A, s);
    await pay(A, due.id, 20000, { paidOn: '2026-10-02' });
    await pay(A, due.id, 30000, { mode: 'upi', paidOn: '2026-10-03' });
    const p3 = await pay(A, due.id, 10000, { mode: 'upi', paidOn: '2026-10-03' });
    await A.call('POST', `/fees/payments/${p3.body.paymentId}/reverse`); // reversal is stamped today
    const r = (await A.call('GET', '/reports/fees?from=2026-10-01&to=2026-10-31')).body;
    expect(r.collected).toBe(50000);
    expect(r.byMode).toEqual([
      { mode: 'cash', net: 20000, payments: 1 },
      { mode: 'upi', net: 30000, payments: 2 },
    ]);
    expect(r.byDay).toEqual([
      { date: '2026-10-02', net: 20000 },
      { date: '2026-10-03', net: 40000 },
      { date: '2026-10-08', net: -10000 },
    ]);
    expect(r.dues).toEqual({ billed: 100000, discount: 0, collected: 50000, outstanding: 50000 });
    expect((await A.call('GET', '/reports/fees?from=2024-01-01&to=2026-10-31')).body.error).toBe(
      'range_too_long',
    );
  });
});

describe('tenant isolation: B can never touch A', () => {
  let aBatch: string, aStudent: string, aDue: string, aPay: string;
  beforeEach(async () => {
    aBatch = await mk(A, '/batches', batch());
    aStudent = await mk(A, '/students', student({ batchIds: [aBatch] }));
    await gen(A);
    aDue = (await dueOf(A, aStudent)).id;
    aPay = (await pay(A, aDue, 10000)).body.paymentId;
    await A.call('PUT', '/attendance', {
      batchId: aBatch,
      date: TODAY,
      marks: { [aStudent]: 'A' },
    });
    await mk(B, '/students', student({ name: 'Beta Kid' }));
    await gen(B);
  });

  it("B's lists, overview, dashboard, reports and ledger contain none of A's data", async () => {
    expect(
      (await B.call('GET', '/fees/dues?status=all')).body.dues.map(
        (d: { studentId: string }) => d.studentId,
      ),
    ).not.toContain(aStudent);
    expect((await B.call('GET', '/fees/dues?status=all')).body.dues).toHaveLength(1);
    expect((await B.call('GET', '/fees/payments')).body.payments).toEqual([]);
    expect((await B.call('GET', '/fees/overview')).body.totals.students).toBe(1);
    expect((await B.call('GET', '/dashboard')).body.fees.collectedThisMonth).toBe(0);
    expect(
      (await B.call('GET', '/reports/fees?from=2026-10-01&to=2026-10-31')).body.collected,
    ).toBe(0);
    expect(
      (await B.call('GET', '/attendance/report?from=2026-10-01&to=2026-10-31')).body.overall.total,
    ).toBe(0);
    expect(
      (await B.call('GET', '/attendance/range?from=2026-10-01&to=2026-10-31')).body.days,
    ).toEqual([]);
    expect((await B.call('GET', `/fees/dues?studentId=${aStudent}&status=all`)).body.dues).toEqual(
      [],
    );
    expect((await B.call('GET', `/fees/payments?studentId=${aStudent}`)).body.payments).toEqual([]);
  });

  it("A's records answer 404 (or 400 for ids in a body) to B, and nothing changes", async () => {
    const miss = { error: 'not_found' };
    for (const [m, u, p] of [
      ['GET', `/fees/payments/${aPay}`],
      ['POST', `/fees/payments/${aPay}/reverse`],
      ['POST', `/fees/dues/${aDue}/payments`, { amount: 100, mode: 'cash' }],
      ['PATCH', `/fees/dues/${aDue}/discount`, { discount: 1 }],
      ['POST', `/fees/dues/${aDue}/waive`, { waived: true }],
      ['GET', `/attendance?batchId=${aBatch}&date=${TODAY}`],
      ['GET', `/students/${aStudent}/attendance?from=2026-10-01&to=2026-10-31`],
    ] as const) {
      const r = await B.call(m, u, p);
      expect([m, u, r.status, r.body]).toEqual([m, u, 404, miss]);
    }
    expect(
      (
        await B.call('POST', '/fees/charges', {
          studentId: aStudent,
          description: 'x',
          amount: 5,
          dueDate: TODAY,
        })
      ).body.error,
    ).toBe('unknown_student');
    expect(
      (await B.call('PUT', '/attendance', { batchId: aBatch, date: TODAY, marks: {} })).body.error,
    ).toBe('unknown_batch');
    const bBatch = await mk(B, '/batches', batch({ name: 'Beta Batch' }));
    expect(
      (
        await B.call('PUT', '/attendance', {
          batchId: bBatch,
          date: TODAY,
          marks: { [aStudent]: 'P' },
        })
      ).body.error,
    ).toBe('unknown_student');
    expect(await dueOf(A, aStudent)).toMatchObject({ paid: 10000, discount: 0, status: 'partial' });
    expect((await A.call('GET', `/attendance?batchId=${aBatch}&date=${TODAY}`)).body.marks).toEqual(
      { [aStudent]: 'A' },
    );
  });

  it('B generating dues touches only B', async () => {
    expect((await gen(B, '2026-11')).body.created).toBe(1);
    expect((await A.call('GET', '/fees/dues?status=all')).body.dues).toHaveLength(1);
  });

  it('the database refuses cross-institute rows even if the code were wrong', async () => {
    const bStudent = (await B.call('GET', '/students')).body.students[0].id as string;
    const insertPay = (inst: string, student: string, due: string, no: string) =>
      h.db.pool.query(
        "INSERT INTO payments (id, institute_id, student_id, due_id, amount, mode, paid_at, receipt_no, recorded_by) VALUES (UUID(), ?, ?, ?, 1, 'cash', NOW(), ?, ?)",
        [inst, student, due, no, B.userId],
      );
    await expect(insertPay(B.instituteId, bStudent, aDue, 'X-1')).rejects.toThrow(/foreign key/i);
    await expect(insertPay(A.instituteId, bStudent, aDue, 'X-2')).rejects.toThrow(/foreign key/i);
    await expect(
      h.db.pool.query(
        "INSERT INTO fee_dues (id, institute_id, student_id, period, amount, due_date, description) VALUES (UUID(), ?, ?, '2026-10', 5, '2026-10-01', 'x')",
        [B.instituteId, aStudent],
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      h.db.pool.query(
        "INSERT INTO attendance_marks (institute_id, day_id, student_id, mark) SELECT ?, id, ?, 'P' FROM attendance_days LIMIT 1",
        [B.instituteId, bStudent],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('the database enforces money rules and unique receipts', async () => {
    await expect(
      h.db.pool.query('UPDATE fee_dues SET paid = amount + 1 WHERE id = ?', [aDue]),
    ).rejects.toThrow(/constraint/i);
    await expect(
      h.db.pool.query('UPDATE fee_dues SET discount = amount + 1 WHERE id = ?', [aDue]),
    ).rejects.toThrow(/constraint|range/i);
    await expect(
      h.db.pool.query(
        "UPDATE payments SET receipt_no = 'TD-00001' WHERE institute_id = ? AND id <> ? LIMIT 1",
        [A.instituteId, aPay],
      ),
    ).resolves.toBeDefined(); // no other row to clash with
    await expect(
      h.db.pool.query(
        "INSERT INTO payments (id, institute_id, student_id, due_id, amount, mode, paid_at, receipt_no, recorded_by) VALUES (UUID(), ?, ?, ?, 1, 'cash', NOW(), 'TD-00001', ?)",
        [A.instituteId, aStudent, aDue, A.userId],
      ),
    ).rejects.toThrow(/duplicate/i);
  });
});

describe('roles and plan', () => {
  const asStaff = async () => {
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    return staff;
  };

  it('staff can read everything here but change nothing', async () => {
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student({ batchIds: [b] }));
    await gen(A);
    const due = (await dueOf(A, s)).id;
    const p = (await pay(A, due, 1000)).body.paymentId;
    const staff = await asStaff();
    for (const u of [
      '/dashboard',
      '/fees/overview',
      '/fees/dues',
      '/fees/payments',
      `/fees/payments/${p}`,
      '/reports/fees?from=2026-10-01&to=2026-10-31',
      '/attendance/report?from=2026-10-01&to=2026-10-31',
      `/attendance?batchId=${b}&date=${TODAY}`,
    ])
      expect([u, (await staff.call('GET', u)).status]).toEqual([u, 200]);
    for (const [m, u, body] of [
      ['PUT', '/attendance', { batchId: b, date: TODAY, marks: {} }],
      ['POST', '/fees/generate', {}],
      ['POST', `/fees/dues/${due}/payments`, { amount: 1, mode: 'cash' }],
      ['POST', `/fees/payments/${p}/reverse`],
      ['POST', '/fees/charges', { studentId: s, description: 'x', amount: 5, dueDate: TODAY }],
      ['PATCH', `/fees/dues/${due}/discount`, { discount: 0 }],
      ['POST', `/fees/dues/${due}/waive`, { waived: true }],
    ] as const)
      expect([m, u, (await staff.call(m, u, body)).status]).toEqual([m, u, 403]);
  });

  it('unauthenticated requests get 401', async () => {
    for (const [m, u] of [
      ['GET', '/dashboard'],
      ['GET', '/fees/dues'],
      ['POST', '/fees/generate'],
      ['PUT', '/attendance'],
      ['GET', '/attendance/report'],
    ] as const)
      expect([m, u, (await h.app.inject({ method: m, url: u })).statusCode]).toEqual([m, u, 401]);
  });

  it('an expired plan is read-only for attendance and fees too', async () => {
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student({ batchIds: [b] }));
    await gen(A);
    const due = (await dueOf(A, s)).id;
    const p = (await pay(A, due, 1000)).body.paymentId;
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const token = signToken(
      A.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const call = (m: 'GET' | 'POST' | 'PATCH' | 'PUT', u: string, body?: unknown) =>
      h.app.inject({
        method: m,
        url: u,
        headers: { authorization: `Bearer ${token}` },
        ...(body === undefined ? {} : { payload: body as object }),
      });
    expect((await call('GET', '/fees/overview')).statusCode).toBe(200);
    expect((await call('GET', '/dashboard')).statusCode).toBe(200);
    for (const [m, u, body] of [
      ['PUT', '/attendance', { batchId: b, date: '2026-10-08', marks: {} }],
      ['POST', '/fees/generate', {}],
      ['POST', `/fees/dues/${due}/payments`, { amount: 1, mode: 'cash' }],
      ['POST', `/fees/payments/${p}/reverse`],
      [
        'POST',
        '/fees/charges',
        { studentId: s, description: 'x', amount: 5, dueDate: '2026-10-20' },
      ],
      ['PATCH', `/fees/dues/${due}/discount`, { discount: 0 }],
      ['POST', `/fees/dues/${due}/waive`, { waived: true }],
    ] as const) {
      const r = await call(m, u, body);
      expect([m, u, r.statusCode, r.json().error]).toEqual([m, u, 402, 'plan_expired']);
    }
  });
});

describe('single due, profile and plan usage (used by the app)', () => {
  it('GET /fees/dues/:id returns one due, and only to its own institute', async () => {
    const s = await mk(A, '/students', student());
    await gen(A);
    const due = await dueOf(A, s);
    expect((await A.call('GET', `/fees/dues/${due.id}`)).body).toMatchObject({
      id: due.id,
      studentId: s,
      amount: 100000,
      status: 'pending',
    });
    expect((await B.call('GET', `/fees/dues/${due.id}`)).status).toBe(404);
    expect((await A.call('GET', '/fees/dues/not-a-uuid')).status).toBe(400);
  });

  it("PATCH /me changes only the caller's own name and language", async () => {
    expect((await A.call('PATCH', '/me', { name: 'New Name', language: 'hi' })).body).toMatchObject(
      { user: { name: 'New Name', language: 'hi' } },
    );
    expect((await B.call('GET', '/me')).body.user.name).toBe('Tutor'); // B untouched
    for (const bad of [{}, { name: 'x' }, { language: 'ta' }, { phone: '+911111111111' }])
      expect((await A.call('PATCH', '/me', bad)).status).toBe(400);
    expect((await A.call('GET', '/me')).body.user.phone).toBe('+919876543210');
  });

  it('/subscription reports how much of the plan is used', async () => {
    await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student());
    await mk(A, '/students', student({ name: 'Bala K' }));
    await A.call('POST', `/students/${s}/deactivate`);
    expect((await A.call('GET', '/subscription')).body.usage).toEqual({ students: 1, batches: 1 });
  });
});
