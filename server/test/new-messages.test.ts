import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PLANS } from '../src/billing/plans.js';
import { applyPaid } from '../src/billing/service.js';
import { parsePayToken } from '../src/billing/payLink.js';
import {
  PLAN_REMINDER_DAYS,
  processCentreQueue,
  queuePlanReminders,
} from '../src/messaging/centreMessages.js';
import { batchWithSchedule, clock12 } from '../src/messaging/notify.js';
import { parseTemplates } from '../src/messaging/templates.js';
import { processQueue } from '../src/messaging/worker.js';
import { newId } from '../src/lib/ids.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
const TEMPLATES = parseTemplates(
  JSON.stringify({
    student_welcome: { en: '301' },
    class_cancelled: { en: '302' },
    centre_welcome: { en: '401' },
    trial_ending: { en: '402' },
    plan_active: { en: '403' },
    helper_invite: { en: '404' },
    plan_ending: { en: '405' },
    plan_ended: { en: '406' },
  }),
);
const LINKS = {
  baseUrl: 'https://tutor.chalkpis.com',
  secret: 'test-jwt-secret-test-jwt-secret-1234',
};

beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  h.provider.sent.length = 0;
  A = await h.tenant('+919876543210', { tutor: 'Kiran', institute: 'Kiran Karate Academy' });
});

const TODAY = '2026-10-08';
const batch = (over = {}) => ({
  name: 'Kids Beginners',
  subject: 'Karate',
  class: 'Yellow belt',
  days: ['fri', 'mon', 'wed'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
  ...over,
});
const student = (over = {}) => ({
  name: 'Riya Sharma',
  parentName: 'Mrs Sharma',
  parentPhone: '9876500001',
  monthlyFee: 150000,
  ...over,
});
const mk = async (path: string, body: unknown) => {
  const r = await A.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const on = (over = {}) =>
  A.call('PUT', '/settings/notifications', {
    enabled: true,
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
const parentRows = async () =>
  (
    (await h.db.pool.query(
      'SELECT type, dedupe_key, status, vars FROM messages ORDER BY created_at, id',
    )) as unknown as [{ type: string; dedupe_key: string; status: string; vars: string }[]]
  )[0];
const centreRows = async () =>
  (
    (await h.db.pool.query(
      'SELECT type, ref, user_id, to_last4, status, reason, vars FROM centre_messages ORDER BY created_at, type',
    )) as unknown as [
      {
        type: string;
        ref: string;
        user_id: string;
        to_last4: string;
        status: string;
        reason: string | null;
        vars: string | null;
      }[],
    ]
  )[0];
const sendParents = () =>
  processQueue({
    pool: h.db.pool,
    provider: h.provider,
    templates: TEMPLATES,
    clock: () => h.clock.now,
  });
const sendCentre = (templates = TEMPLATES) =>
  processCentreQueue({
    pool: h.db.pool,
    provider: h.provider,
    templates,
    publicBaseUrl: 'https://tutor.chalkpis.com',
    clock: () => h.clock.now,
  });

describe('welcome when a student is added', () => {
  it('tells the parent which batch, days and time, then sends it with its template', async () => {
    await on();
    const b = await mk('/batches', batch());
    await mk('/students', student({ batchIds: [b] }));
    const [row] = await parentRows();
    expect(row).toMatchObject({ type: 'student_welcome', status: 'queued' });
    expect(JSON.parse(row!.vars)).toEqual([
      'Riya Sharma',
      'Kids Beginners (Mon, Wed, Fri 5:00 PM)',
      'Kiran Karate Academy',
    ]);
    expect(await sendParents()).toMatchObject({ sent: 1 });
    expect(h.provider.sent[0]).toMatchObject({ to: '+919876500001', templateId: '301' });
  });

  it('is never sent for an import, with messages off, when switched off, or twice', async () => {
    await mk('/students', student()); // messages are off by default
    await on();
    const imported = await A.call('POST', '/students/bulk', {
      students: [student({ name: 'Imported One' }), student({ name: 'Imported Two' })],
    });
    expect(imported.status).toBe(201);
    expect(await parentRows()).toEqual([]);
    await on({ studentWelcome: false });
    await mk('/students', student({ name: 'Switched Off' }));
    expect(await parentRows()).toEqual([]);
    await on({ studentWelcome: true });
    await mk('/students', student({ name: 'Without Batch' }));
    const rows = await parentRows();
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.vars)[1]).toBe('our classes');
  });

  it('an older app that does not know the switch keeps what was saved', async () => {
    await on({ studentWelcome: false, classCancelled: false });
    const old = { ...(await A.call('GET', '/settings/notifications')).body };
    delete old.studentWelcome;
    delete old.classCancelled;
    expect((await A.call('PUT', '/settings/notifications', old)).status).toBe(200);
    expect((await A.call('GET', '/settings/notifications')).body).toMatchObject({
      studentWelcome: false,
      classCancelled: false,
    });
  });
});

describe('class cancelled', () => {
  let b: string;
  let s1: string;
  let s2: string;
  beforeEach(async () => {
    b = await mk('/batches', batch());
    s1 = await mk('/students', student({ batchIds: [b] }));
    s2 = await mk(
      '/students',
      student({ name: 'Arjun K', parentPhone: '9876500002', batchIds: [b] }),
    );
  });
  const holiday = (date = TODAY, kind = 'cancelled') =>
    A.call('PUT', '/attendance', { batchId: b, date, holiday: kind, marks: {} });

  it("today's class called off tells every parent in the batch, once", async () => {
    await on();
    expect((await holiday()).status).toBe(200);
    expect((await holiday(TODAY, 'holiday')).status).toBe(200); // saved again: nothing new
    const rows = await parentRows();
    expect(rows.map((r) => r.type)).toEqual(['class_cancelled', 'class_cancelled']);
    expect(JSON.parse(rows[0]!.vars)).toEqual([
      expect.any(String),
      'Kids Beginners class on 8 Oct 2026',
      'Kiran Karate Academy',
    ]);
    expect(await sendParents()).toMatchObject({ sent: 2 });
    expect(h.provider.sent.map((m) => m.templateId)).toEqual(['302', '302']);
  });

  it('a past day, a parent who opted out, a switched-off setting or messages off tell nobody', async () => {
    await holiday(); // messages are still off
    await on({ classCancelled: false });
    await holiday('2026-10-07');
    await holiday();
    expect(await parentRows()).toEqual([]);
    await on({ classCancelled: true });
    await A.call('PATCH', `/students/${s1}`, { notifyParent: false });
    await holiday('2026-10-07'); // yesterday: recorded afterwards, so nobody is told
    expect(await parentRows()).toEqual([]);
    await holiday();
    expect((await parentRows()).map((r) => r.dedupe_key)).toEqual([expect.stringContaining(s2)]);
  });
});

describe('messages from Chalkpis to the centre', () => {
  it('a new centre welcomes its owner with the trial end date', async () => {
    const [row] = await centreRows();
    expect(row).toMatchObject({
      type: 'centre_welcome',
      ref: '',
      user_id: A.userId,
      to_last4: '3210',
      status: 'queued',
    });
    expect(JSON.parse(row!.vars!)).toEqual(['Kiran', 'Kiran Karate Academy', '15 Oct 2026']);
    expect(await sendCentre()).toMatchObject({ sent: 1 });
    expect(h.provider.sent[0]).toMatchObject({
      to: '+919876543210',
      templateId: '401',
      vars: ['Kiran', 'Kiran Karate Academy', '15 Oct 2026'],
    });
    expect((await centreRows())[0]).toMatchObject({ status: 'sent', vars: null });
    expect(await sendCentre()).toMatchObject({ sent: 0 }); // never twice
  });

  it('a helper is invited by WhatsApp, once', async () => {
    await h.db.pool.query('DELETE FROM centre_messages');
    const r = await A.call('POST', '/staff', {
      phone: '9876511111',
      name: 'Arjun',
      batchIds: [],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const [row] = await centreRows();
    expect(row).toMatchObject({ type: 'helper_invite', ref: r.body.id, user_id: r.body.id });
    expect(JSON.parse(row!.vars!)).toEqual(['Arjun', 'Kiran', 'Kiran Karate Academy']);
    await sendCentre();
    expect(h.provider.sent[0]).toMatchObject({ to: '+919876511111', templateId: '404' });
  });

  it('a paid plan is confirmed to the owner with its end date, once per payment', async () => {
    await h.db.pool.query('DELETE FROM centre_messages');
    await h.db.pool.query(
      "INSERT INTO billing_orders (id, institute_id, plan_id, cycle, amount, provider, link_id, url, created_by) VALUES (?, ?, 'standard', 'year', ?, 'razorpay', 'link_1', '', ?)",
      [newId(), A.instituteId, PLANS.standard.prices.year, A.userId],
    );
    const paid = {
      paymentId: 'pay_1',
      linkId: 'link_1',
      amountPaise: PLANS.standard.prices.year,
    };
    expect(await applyPaid(h.db.pool, 'razorpay', paid, h.clock.now)).toBe('applied');
    expect(await applyPaid(h.db.pool, 'razorpay', paid, h.clock.now)).toBe('duplicate');
    const rows = await centreRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'plan_active', ref: 'pay_1' });
    expect(JSON.parse(rows[0]!.vars!)).toEqual([
      'Kiran',
      'Standard plan for Kiran Karate Academy',
      expect.stringMatching(/^\d{1,2} \w{3} \d{4}$/),
    ]);
  });

  it(`reminds the owner with the pay link ${PLAN_REMINDER_DAYS.trial} days before a trial ends (${PLAN_REMINDER_DAYS.paid} for a paid plan), once`, async () => {
    const B = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' });
    await h.db.pool.query('DELETE FROM centre_messages');
    const ends = (t: Tenant, days: number, plan = 'trial') =>
      h.db.pool.query('UPDATE subscriptions SET plan = ?, expires_at = ? WHERE institute_id = ?', [
        plan,
        new Date(h.clock.now.getTime() + days * 86_400_000),
        t.instituteId,
      ]);
    await ends(A, 1.5);
    await ends(B, 3.5); // a trial 3.5 days out is not yet due
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(1);
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(0);
    const [row] = await centreRows();
    expect(row).toMatchObject({ type: 'plan_ending', user_id: A.userId });
    const vars = JSON.parse(row!.vars!) as string[];
    expect(vars.slice(0, 3)).toEqual([
      'Kiran',
      'free trial for Kiran Karate Academy',
      '9 Oct 2026',
    ]);
    const link = vars[3]!;
    expect(link).toMatch(/^https:\/\/tutor\.chalkpis\.com\/pay\/[A-Za-z0-9_-]{38}$/);
    expect(parsePayToken(LINKS.secret, link.split('/').pop()!)).toBe(A.instituteId);

    // a trial's last day is reminded once more
    await ends(A, 0.5);
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(1);
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(0);
    expect((await centreRows()).map((r) => r.ref).sort()).toEqual([
      '2026-10-08-last',
      '2026-10-09',
    ]);
    await ends(A, 30); // out of the window again

    // a store subscription that renews by itself is not reminded about
    await ends(B, 2.5, 'standard');
    await h.db.pool.query(
      "UPDATE subscriptions SET store = 'app_store', store_will_renew = 1 WHERE institute_id = ?",
      [B.instituteId],
    );
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(0);
    await h.db.pool.query(
      'UPDATE subscriptions SET store = NULL, store_will_renew = NULL WHERE institute_id = ?',
      [B.instituteId],
    );

    // a paid plan is reminded 3 days ahead
    await ends(B, 2.5, 'standard');
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(1);
    const meena = (await centreRows()).find((r) => r.user_id === B.userId)!;
    expect(JSON.parse(meena.vars!).slice(1, 2)).toEqual(['Standard plan for Meena Dance']);

    // sent with the banner as the header image
    expect(await sendCentre()).toMatchObject({ sent: 3 });
    expect(h.provider.sent.find((m) => m.templateId === '405')).toMatchObject({
      imageUrl: 'https://tutor.chalkpis.com/plan-renew.png',
    });
  });

  it('a reminder whose template is not set yet is not queued, and goes out once it is', async () => {
    await h.db.pool.query('DELETE FROM centre_messages');
    await h.db.pool.query('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [
      new Date(h.clock.now.getTime() + 86_400_000),
      A.instituteId,
    ]);
    const none = { ...LINKS, templates: parseTemplates('{"plan_ended":{"en":"406"}}') };
    expect(await queuePlanReminders(h.db.pool, h.clock.now, none)).toBe(0);
    expect(await centreRows()).toHaveLength(0);
    expect(
      await queuePlanReminders(h.db.pool, h.clock.now, { ...LINKS, templates: TEMPLATES }),
    ).toBe(1);
  });

  it('on the day a plan ended, the owner gets the pay link once; long-ended plans are left alone', async () => {
    const B = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' });
    await h.db.pool.query('DELETE FROM centre_messages');
    const ended = (t: Tenant, daysAgo: number) =>
      h.db.pool.query(
        "UPDATE subscriptions SET plan = 'trial', status = 'expired', expires_at = ? WHERE institute_id = ?",
        [new Date(h.clock.now.getTime() - daysAgo * 86_400_000), t.instituteId],
      );
    await ended(A, 0.5);
    await ended(B, 30);
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(1);
    expect(await queuePlanReminders(h.db.pool, h.clock.now, LINKS)).toBe(0);
    const rows = await centreRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'plan_ended', user_id: A.userId });
    expect(await sendCentre()).toMatchObject({ sent: 1 });
    expect(h.provider.sent.at(-1)).toMatchObject({
      templateId: '406',
      imageUrl: 'https://tutor.chalkpis.com/plan-renew.png',
    });
  });

  it('skips with a reason when no template is set, and retries a failed send', async () => {
    expect(await sendCentre(parseTemplates('{}'))).toMatchObject({ skipped: 1 });
    expect((await centreRows())[0]).toMatchObject({ status: 'skipped', reason: 'no-template' });

    await h.db.pool.query(
      'UPDATE centre_messages SET status = \'queued\', reason = NULL, vars = \'["a","b","c"]\', attempts = 0',
    );
    h.provider.failNext = true;
    expect(await sendCentre()).toMatchObject({ retry: 1 });
    h.clock.now = new Date(h.clock.now.getTime() + 3 * 60_000);
    expect(await sendCentre()).toMatchObject({ sent: 1 });
  });
});

describe('formatting', () => {
  it('shows times and schedules the way parents read them', () => {
    expect(clock12('00:05')).toBe('12:05 AM');
    expect(clock12('12:00')).toBe('12:00 PM');
    expect(clock12('17:30')).toBe('5:30 PM');
    expect(batchWithSchedule({ name: 'Yoga', days: 'sat,sun', start_time: '06:30' })).toBe(
      'Yoga (Sat, Sun 6:30 AM)',
    );
    expect(batchWithSchedule({ name: 'Open', days: '', start_time: '' })).toBe('Open');
  });
});
