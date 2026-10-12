import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activityText, loginText } from '../src/admin/crm.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const ADMIN = '+919000000001';
const IOS = { 'x-client-platform': 'ios' };
let h: Harness;
let admin: Tenant;
let A: Tenant;
let B: Tenant;
beforeAll(async () => {
  h = await startHarness({ ADMIN_PHONES: [ADMIN] });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  // the admin's own tutor login still exists (and cannot be blocked); the dashboard uses an admin session
  await h.tenant(ADMIN, { institute: 'HQ' });
  admin = await h.admin();
  A = await h.tenant('+919876543210', { tutor: 'Asha', institute: 'Alpha Academy' });
  B = await h.tenant('+919876543211', { tutor: 'Bala', institute: 'Beta Classes' });
});

const read = async () =>
  (
    (await h.db.pool.query(
      'SELECT institute_id, user_id, action, subject, detail, platform FROM activity_log ORDER BY id',
    )) as unknown as [Record<string, string | null>[]]
  )[0];
/** The log is written just after each response goes out, so give the last write a moment to land. */
async function rows(atLeast = 0) {
  for (let i = 0; i < 40; i++) {
    const r = await read();
    if (r.length >= atLeast) return r;
    await new Promise((ok) => setTimeout(ok, 25));
  }
  return read();
}

/** A morning at a centre: six changes, each of which lands in its log. */
async function busyDay(t: Tenant) {
  const start = (await read()).length;
  const s = (
    await t.call(
      'POST',
      '/students',
      {
        name: 'Riya Sharma',
        parentPhone: '9876500001',
        monthlyFee: 150000,
        joinedAt: '2026-09-01T00:00:00.000Z',
      },
      IOS,
    )
  ).body.id as string;
  const b = (
    await t.call('POST', '/batches', {
      name: 'Maths 10',
      subject: 'Maths',
      class: '10',
      days: ['thu'],
      startTime: '17:00',
      endTime: '18:00',
      defaultFee: 1,
    })
  ).body.id as string;
  await t.call('POST', `/batches/${b}/students`, { studentIds: [s] });
  await t.call('PUT', '/attendance', { batchId: b, date: '2026-10-08', marks: { [s]: 'P' } });
  await t.call('POST', '/fees/generate', {});
  const due = (await t.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0].id as string;
  await t.call('POST', `/fees/dues/${due}/payments`, { amount: 150000, mode: 'upi' }, IOS);
  await rows(start + 6);
  return { s, b };
}

describe("each centre's log", () => {
  it('records every successful change, with who, what it was about and a short detail', async () => {
    await busyDay(A);
    const log = await rows(6);
    expect(log.every((r) => r.institute_id === A.instituteId && r.user_id === A.userId)).toBe(true);
    expect(log.map((r) => [r.action, r.subject, r.detail])).toEqual([
      ['student.add', '', 'Riya Sharma'],
      ['batch.add', '', 'Maths 10'],
      ['batch.students-add', 'Maths 10', '1 students'],
      ['attendance.save', 'Maths 10', '2026-10-08 · 1/1 present'],
      ['fee.generate', '', 'this month'],
      ['fee.payment', 'Riya Sharma', '₹1,500 · upi'],
    ]);
    expect(log[0]!.platform).toBe('ios');
    expect(log[1]!.platform).toBeNull();
  });

  it('never logs reads or refused requests', async () => {
    await A.call('GET', '/students');
    await A.call('POST', '/students', { name: '' }); // 400
    await B.call('PATCH', '/students/00000000-0000-4000-8000-000000000000', { name: 'X' }); // 404
    await new Promise((ok) => setTimeout(ok, 100));
    expect(await read()).toEqual([]);
  });

  it('the admin sees one centre at a time, as sentences, and can search and download it', async () => {
    await busyDay(A);
    await busyDay(B);
    const url = `/admin/api/events?institute=${A.instituteId}`;
    const ev = (await admin.call('GET', url)).body.events as {
      kind: string;
      text: string;
      amount: number | null;
      actor: string;
      instituteId: string;
      platform: string | null;
    }[];
    expect(ev.length).toBeGreaterThan(5);
    expect(ev.every((e) => e.instituteId === A.instituteId)).toBe(true);
    // fees and attendance appear once, from their own tables, naming the person who entered them
    const texts = ev.map((e) => e.text);
    expect(texts.filter((t) => t.startsWith('recorded a fee from Riya Sharma'))).toHaveLength(1);
    expect(ev.find((e) => e.kind === 'payment')).toMatchObject({ actor: 'Asha', amount: 150000 });
    expect(texts.filter((t) => /attendance for Maths 10/.test(t))).toEqual([
      'marked attendance for Maths 10',
    ]);
    expect(texts).toContain('added students to Maths 10 · 1 students');
    expect(ev.find((e) => e.text.startsWith('added a student'))).toMatchObject({
      actor: 'Asha',
      platform: 'ios',
    });

    const found = (await admin.call('GET', `${url}&q=attendance`)).body.events;
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((e: { text: string }) => /attendance/i.test(e.text))).toBe(true);
    const onlyActivity = (await admin.call('GET', `${url}&kinds=activity`)).body.events;
    expect(onlyActivity.every((e: { kind: string }) => e.kind === 'activity')).toBe(true);

    const csv = await admin.call('GET', `/admin/api/institutes/${A.instituteId}/logs.csv`);
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toMatch(/^\ufeff?When,Kind,Who,What,Amount \(Rs\),Device/);
    expect(String(csv.body)).toContain('recorded a fee from Riya Sharma');
    expect(String(csv.body)).not.toContain('Beta Classes');
    expect((await A.call('GET', `/admin/api/institutes/${A.instituteId}/logs.csv`)).status).toBe(
      401,
    );
  });

  it('the centre page shows a 30-day trend and which kinds of work it does', async () => {
    await busyDay(A);
    const r = (await admin.call('GET', `/admin/api/institutes/${A.instituteId}`)).body;
    expect(r.trend.dates).toHaveLength(30);
    expect(r.trend.values.reduce((a: number, b: number) => a + b, 0)).toBe(6);
    expect(r.areas).toEqual(
      expect.arrayContaining([
        { area: 'fee', count: 2 },
        { area: 'batch', count: 2 },
        { area: 'student', count: 1 },
        { area: 'attendance', count: 1 },
      ]),
    );
  });

  it('the overview counts sign-in methods and devices, and ranks the busiest centres', async () => {
    await busyDay(A);
    await h.db.pool.query(
      "INSERT INTO login_events (user_id, method, platform, created_at) VALUES (?, 'google', 'android', ?), (?, 'apple', 'ios', ?)",
      [A.userId, h.clock.now, B.userId, h.clock.now],
    );
    const r = (await admin.call('GET', '/admin/api/analytics?days=30')).body;
    expect(r.signInMethods).toMatchObject({ google: 1, apple: 1 });
    expect(r.signInPlatforms).toMatchObject({ android: 1, ios: 1 });
    expect(r.topCentres[0]).toMatchObject({ id: A.instituteId, name: 'Alpha Academy', events: 7 });
  });
});

describe('log lines read as sentences', () => {
  const US = String.fromCharCode(31);
  it('names the method of a sign-in (the phone is shown on its own)', () => {
    expect(loginText(['signed in', 'google', 'ios'].join(US))).toBe('signed in with Google');
    expect(loginText(['signed in', '', ''].join(US))).toBe('signed in');
  });
  it('fills in what an action was about, and copes with an unknown one', () => {
    expect(activityText(['student.edit', 'Riya', '', ''].join(US))).toBe('edited Riya');
    expect(activityText(['fee.payment', '', '₹10', ''].join(US))).toBe(
      'recorded a fee from a record · ₹10',
    );
    expect(activityText(['new.thing', '', '', ''].join(US))).toBe('new thing');
  });
});
