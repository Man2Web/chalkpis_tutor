import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeJobs, runDueJobs } from '../src/jobs/runner.js';
import { processCentreQueue } from '../src/messaging/centreMessages.js';
import { parseTemplates } from '../src/messaging/templates.js';
import {
  queueDailyReports,
  todayText,
  yesterdayText,
  type DailyReport,
} from '../src/reports/daily.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
const TEMPLATES = parseTemplates(JSON.stringify({ daily_report: { en: '407' } }));
const LINKS = {
  baseUrl: 'https://tutor.chalkpis.com',
  secret: 'test-jwt-secret-test-jwt-secret-1234',
  templates: TEMPLATES,
};
/** Fri 9 Oct 2026, 6:00 am in India: the report covers Thu 8 Oct (the harness's own day). */
const SIX_AM = new Date('2026-10-09T00:30:00Z');
const log = { info: () => undefined, error: () => undefined };

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  h.provider.sent.length = 0;
  A = await h.tenant('+919876543210', { tutor: 'Kiran', institute: 'Kiran Karate Academy' });
});

const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const batch = (name: string, days: string[], startTime: string) => ({
  name,
  subject: 'Karate',
  days,
  startTime,
  endTime: '23:00',
  defaultFee: 150000,
});
let phoneNo = 0;
const student = (t: Tenant, name: string, batchIds: string[]) =>
  mk(t, '/students', {
    name,
    parentName: 'Parent',
    parentPhone: `98765${String(++phoneNo).padStart(5, '0')}`,
    monthlyFee: 150000,
    batchIds,
  });
/** Rows are stamped by the database's own clock; the tests run on the harness's October dates. */
const backdate = (t: Tenant) =>
  Promise.all(
    ['batches', 'students'].map((table) =>
      h.db.pool.query(`UPDATE ${table} SET created_at = ? WHERE institute_id = ?`, [
        new Date('2026-10-01T06:00:00Z'),
        t.instituteId,
      ]),
    ),
  );
const reports = async () =>
  (
    (await h.db.pool.query(
      "SELECT institute_id, ref, user_id, status, vars FROM centre_messages WHERE type = 'daily_report'",
    )) as unknown as [
      { institute_id: string; ref: string; user_id: string; status: string; vars: string | null }[],
    ]
  )[0];
const settings = (t: Tenant, over = {}) =>
  t.call('PUT', '/settings/notifications', {
    enabled: false,
    absent: true,
    late: true,
    feeDue: true,
    feeDueDaysBefore: 2,
    feeOverdue: true,
    overdueEveryDays: 7,
    paymentReceived: true,
    language: 'en',
    ...over,
  });

/** A centre's Thursday: one class marked, one forgotten, a fee paid, a new student and an enquiry. */
async function busyThursday() {
  const seniors = await mk(A, '/batches', batch('Seniors', ['thu', 'fri'], '07:00'));
  const juniors = await mk(A, '/batches', batch('Juniors', ['thu'], '16:00'));
  const kids = await mk(A, '/batches', batch('Kids', ['mon', 'wed', 'fri'], '17:00'));
  const [s1, s2, s3] = [
    await student(A, 'Asha', [seniors]),
    await student(A, 'Bala', [seniors]),
    await student(A, 'Chitra', [seniors]),
  ];
  await student(A, 'Dev', [juniors]);
  const newcomer = await student(A, 'Esha', [kids]);
  await backdate(A);
  await h.db.pool.query('UPDATE students SET created_at = ? WHERE id = ?', [
    new Date('2026-10-08T05:00:00Z'),
    newcomer,
  ]);
  const marked = await A.call('PUT', '/attendance', {
    batchId: seniors,
    date: '2026-10-08',
    marks: { [s1]: 'P', [s2]: 'A', [s3]: 'L' },
  });
  expect(marked.status, JSON.stringify(marked.body)).toBe(200);
  await A.call('POST', '/fees/generate', { period: '2026-10' });
  const due = (await A.call('GET', `/fees/dues?status=all&studentId=${s1}&period=2026-10`)).body
    .dues[0] as { id: string };
  expect(
    (await A.call('POST', `/fees/dues/${due.id}/payments`, { amount: 50000, mode: 'cash' })).status,
  ).toBe(201);
  await mk(A, '/enquiries', {
    name: 'Farah',
    phone: '9876599999',
    nextFollowUp: '2026-10-09',
  });
}

describe('the 6 am report', () => {
  it('tells the owner about yesterday and today, and goes out with the daily report template', async () => {
    await busyThursday();
    h.clock.now = SIX_AM;
    expect(await runDueJobs(h.db.pool, SIX_AM, log, makeJobs(LINKS))).toContain('daily-report');
    const [row] = await reports();
    expect(row).toMatchObject({
      institute_id: A.instituteId,
      ref: '2026-10-09',
      user_id: A.userId,
      status: 'queued',
    });
    const vars = JSON.parse(row!.vars!) as string[];
    // five students at ₹1,500 for October (due on the 1st), ₹500 of it paid
    expect(vars).toEqual([
      'Kiran',
      'Kiran Karate Academy',
      'Thu, 8 Oct: 1 present, 1 absent, 1 late in 1 class; attendance not marked for 1 class; ₹500 collected (1 payment); 1 new student; 1 new enquiry.',
      'Fri, 9 Oct: 2 classes, first at 7:00 AM; ₹7,000 fees pending from 5 students (₹7,000 overdue); 1 enquiry follow-up due.',
    ]);

    expect(
      await processCentreQueue({
        pool: h.db.pool,
        provider: h.provider,
        templates: TEMPLATES,
        clock: () => SIX_AM,
      }),
    ).toMatchObject({ sent: 1 });
    expect(h.provider.sent[0]).toMatchObject({ to: '+919876543210', templateId: '407', vars });
  });

  it('is queued once a day: a second run that day sends nothing new, the next morning does', async () => {
    await busyThursday();
    expect(await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES)).toBe(1);
    expect(await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES)).toBe(0);
    expect(await runDueJobs(h.db.pool, SIX_AM, log, makeJobs(LINKS))).toContain('daily-report');
    expect(await reports()).toHaveLength(1);
    const next = new Date('2026-10-10T00:31:00Z');
    expect(await queueDailyReports(h.db.pool, next, TEMPLATES)).toBe(1);
    expect((await reports()).map((r) => r.ref).sort()).toEqual(['2026-10-09', '2026-10-10']);
  });

  it('runs from 6 to 8:59 am only', async () => {
    await busyThursday();
    const jobs = makeJobs(LINKS);
    expect(await runDueJobs(h.db.pool, new Date('2026-10-09T00:20:00Z'), log, jobs)).not.toContain(
      'daily-report',
    ); // 5:50 am
    expect(await runDueJobs(h.db.pool, new Date('2026-10-09T03:40:00Z'), log, jobs)).not.toContain(
      'daily-report',
    ); // 9:10 am: a server that was down all morning does not send a stale report
    expect(await runDueJobs(h.db.pool, new Date('2026-10-09T03:20:00Z'), log, jobs)).toContain(
      'daily-report',
    ); // 8:50 am
  });

  it('is not queued without its template, when the owner turned it off, or for a centre with no students', async () => {
    await busyThursday();
    expect(await queueDailyReports(h.db.pool, SIX_AM, parseTemplates(''))).toBe(0);
    expect(await queueDailyReports(h.db.pool, SIX_AM, undefined)).toBe(0);

    const B = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' }); // no students
    expect((await settings(A, { dailyReport: false })).status).toBe(200);
    expect((await A.call('GET', '/settings/notifications')).body.dailyReport).toBe(false);
    // an older app saves its settings without the new switch: the owner's choice is kept
    expect((await settings(A)).status).toBe(200);
    expect(await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES)).toBe(0);
    expect(await reports()).toEqual([]);

    expect((await settings(A, { dailyReport: true })).status).toBe(200);
    await student(B, 'Gita', []);
    expect(await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES)).toBe(2);
  });

  it('is on by default, apart from the switch for parent messages', async () => {
    expect((await A.call('GET', '/settings/notifications')).body).toMatchObject({
      enabled: false,
      dailyReport: true,
    });
  });

  it('is not sent once the plan has ended, or to a blocked owner', async () => {
    await busyThursday();
    await h.db.pool.query('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [
      new Date('2026-10-08T00:00:00Z'),
      A.instituteId,
    ]);
    expect(await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES)).toBe(0);
    await h.db.pool.query('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [
      new Date('2026-11-08T00:00:00Z'),
      A.instituteId,
    ]);
    await h.db.pool.query('UPDATE users SET blocked_at = ? WHERE id = ?', [SIX_AM, A.userId]);
    expect(await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES)).toBe(0);
  });

  it('leaves out classes on a calendar holiday, and says so', async () => {
    await busyThursday();
    expect(
      (
        await A.call('POST', '/calendar/events', {
          title: 'Ayudha Pooja',
          kind: 'holiday',
          startsOn: '2026-10-09',
          endsOn: '2026-10-09',
        })
      ).status,
    ).toBe(201);
    await queueDailyReports(h.db.pool, SIX_AM, TEMPLATES);
    const vars = JSON.parse((await reports())[0]!.vars!) as string[];
    expect(vars[3]).toMatch(/^Fri, 9 Oct: holiday \(Ayudha Pooja\); ₹/);
  });
});

describe('the words', () => {
  const base: DailyReport = {
    yesterday: '2026-11-04',
    today: '2026-11-05',
    attendance: {
      classes: 0,
      present: 0,
      absent: 0,
      late: 0,
      holiday: 0,
      cancelled: 0,
      notMarked: 0,
    },
    holidayYesterday: null,
    collected: { net: 0, payments: 0 },
    newStudents: 0,
    newEnquiries: 0,
    classesToday: { count: 0, firstStart: null },
    holidayToday: null,
    testsToday: 0,
    eventsToday: [],
    fees: { outstanding: 0, students: 0, overdue: 0 },
    followUps: 0,
  };

  it('a quiet day', () => {
    expect(yesterdayText(base)).toBe('Wed, 4 Nov: no classes; no fees collected.');
    expect(todayText(base)).toBe('Thu, 5 Nov: no classes; no fees pending.');
  });

  it('a full day', () => {
    const r: DailyReport = {
      ...base,
      attendance: { ...base.attendance, classes: 4, present: 42, holiday: 1, cancelled: 2 },
      collected: { net: 450000, payments: 3 },
      newStudents: 2,
      classesToday: { count: 1, firstStart: '17:30' },
      testsToday: 2,
      eventsToday: ['Parent meeting'],
      fees: { outstanding: 1200000, students: 8, overdue: 0 },
      followUps: 3,
    };
    expect(yesterdayText(r)).toBe(
      'Wed, 4 Nov: all 42 present in 4 classes; 1 class on holiday; 2 classes cancelled; ₹4,500 collected (3 payments); 2 new students.',
    );
    expect(todayText(r)).toBe(
      'Thu, 5 Nov: 1 class at 5:30 PM; 2 tests; event: Parent meeting; ₹12,000 fees pending from 8 students; 3 enquiry follow-ups due.',
    );
  });

  it('a centre-wide holiday', () => {
    expect(yesterdayText({ ...base, holidayYesterday: 'Diwali' })).toBe(
      'Wed, 4 Nov: holiday (Diwali); no fees collected.',
    );
  });
});
