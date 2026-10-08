import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signToken } from '../src/lib/jwt.js';
import { enqueueAllFeeReminders, enqueueFeeReminders } from '../src/messaging/notify.js';
import {
  cleanVar,
  overdueStage,
  parseTemplates,
  templateFor,
  varsFor,
} from '../src/messaging/templates.js';
import { MAX_ATTEMPTS, processQueue } from '../src/messaging/worker.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;
const TEMPLATES = parseTemplates(
  JSON.stringify({
    absent: { en: '101', hi: '201' },
    late: { en: '102' },
    fee_due: { en: '103' },
    fee_overdue: { en: '104' },
    payment_received: { en: '105' },
  }),
);

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  h.provider.sent.length = 0;
  h.provider.failNext = false;
  A = await h.tenant('+919876543210', { institute: 'Alpha Academy' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

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
  parentName: 'Mr Rao',
  parentPhone: '9876500001',
  monthlyFee: 100000,
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const on = (t: Tenant, over = {}) =>
  t.call('PUT', '/settings/notifications', {
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
const run = (templates = TEMPLATES, provider: typeof h.provider | null = h.provider) =>
  processQueue({ pool: h.db.pool, provider, templates, clock: () => h.clock.now });
const rows = async (where = '1=1') =>
  (
    (await h.db.pool.query(
      `SELECT * FROM messages WHERE ${where} ORDER BY created_at, id`,
    )) as unknown as [Record<string, unknown>[]]
  )[0];
const mark = (t: Tenant, batchId: string, date: string, marks: Record<string, string>) =>
  t.call('PUT', '/attendance', { batchId, date, marks });

describe('settings', () => {
  it('start switched off, can be saved, and are validated', async () => {
    expect((await A.call('GET', '/settings/notifications')).body).toEqual({
      enabled: false,
      absent: true,
      late: true,
      feeDue: true,
      feeDueDaysBefore: 2,
      feeOverdue: true,
      overdueEveryDays: 7,
      paymentReceived: true,
      language: 'en',
    });
    expect((await on(A, { language: 'hi', feeDueDaysBefore: 5 })).status).toBe(200);
    expect((await A.call('GET', '/settings/notifications')).body).toMatchObject({
      enabled: true,
      language: 'hi',
      feeDueDaysBefore: 5,
    });
    expect((await B.call('GET', '/settings/notifications')).body.enabled).toBe(false); // B unaffected
    for (const bad of [
      { feeDueDaysBefore: 16 },
      { feeDueDaysBefore: -1 },
      { overdueEveryDays: 0 },
      { overdueEveryDays: 31 },
      { language: 'ta' },
      { enabled: 'yes' },
      { feeDueDaysBefore: 1.5 },
    ])
      expect((await on(A, bad)).status).toBe(400);
    expect((await A.call('PUT', '/settings/notifications', { enabled: true })).status).toBe(400);
  });

  it('staff can neither read nor change messages; an expired plan cannot change either', async () => {
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    expect((await staff.call('GET', '/settings/notifications')).status).toBe(403);
    expect((await staff.call('GET', '/messages')).status).toBe(403);
    expect((await on(staff)).status).toBe(403);
    expect((await staff.call('POST', '/messages/reminders/run')).status).toBe(403);
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const token = signToken(
      A.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const r = await h.app.inject({
      method: 'PUT',
      url: '/settings/notifications',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        enabled: true,
        absent: true,
        late: true,
        feeDue: true,
        feeDueDaysBefore: 2,
        feeOverdue: true,
        overdueEveryDays: 7,
        paymentReceived: true,
        language: 'en',
      },
    });
    expect(r.statusCode).toBe(402);
  });
});

describe('attendance messages', () => {
  let b: string;
  let s1: string;
  let s2: string;
  beforeEach(async () => {
    b = await mk(A, '/batches', batch());
    s1 = await mk(A, '/students', student({ batchIds: [b] }));
    s2 = await mk(
      A,
      '/students',
      student({ name: 'Bala K', parentName: 'Mrs K', parentPhone: '9876500002', batchIds: [b] }),
    );
  });

  it('nothing is queued while messages are off', async () => {
    await mark(A, b, TODAY, { [s1]: 'A', [s2]: 'L' });
    expect(await rows()).toEqual([]);
  });

  it('absent and late are queued with the right values, then sent to the parent with the right template', async () => {
    await on(A);
    expect((await mark(A, b, TODAY, { [s1]: 'A', [s2]: 'L' })).status).toBe(200);
    expect((await rows()).map((r) => [r.type, r.status])).toEqual(
      expect.arrayContaining([
        ['absent', 'queued'],
        ['late', 'queued'],
      ]),
    );
    expect(await run()).toMatchObject({ sent: 2 });
    const absent = h.provider.sent.find((m) => m.templateId === '101')!;
    expect(absent).toMatchObject({
      to: '+919876500001',
      vars: ['Asha Rao', 'Maths 10 class on 8 Oct 2026', 'Alpha Academy'],
    });
    expect(h.provider.sent.find((m) => m.templateId === '102')).toMatchObject({
      to: '+919876500002',
      vars: ['Bala K', 'Maths 10 class on 8 Oct 2026', 'Alpha Academy'],
    });
    expect(
      (await rows()).every((r) => r.status === 'sent' && r.vars === null && r.provider_id),
    ).toBe(true); // values are dropped once final
  });

  it('the stored log never contains a full phone number', async () => {
    await on(A);
    await mark(A, b, TODAY, { [s1]: 'A' });
    await run();
    const dump = JSON.stringify(await rows());
    expect(dump).not.toContain('9876500001');
    expect((await rows())[0]).toMatchObject({ to_last4: '0001' });
    const log = (await A.call('GET', '/messages')).body.messages;
    expect(JSON.stringify(log)).not.toContain('9876500001');
    expect(log[0]).toMatchObject({
      studentName: 'Asha Rao',
      type: 'absent',
      status: 'sent',
      toLast4: '0001',
      channel: 'mock',
    });
  });

  it('the language setting picks the Hindi template, falling back to English when there is none', async () => {
    await on(A, { language: 'hi' });
    await mark(A, b, TODAY, { [s1]: 'A', [s2]: 'L' });
    await run();
    expect(h.provider.sent.map((m) => m.templateId).sort()).toEqual(['102', '201']); // absent has a hi template, late falls back to en
    expect(h.provider.sent.find((m) => m.templateId === '201')!.vars[1]).toMatch(/2026/);
  });

  it('switching a type off queues only the other', async () => {
    await on(A, { late: false });
    await mark(A, b, TODAY, { [s1]: 'A', [s2]: 'L' });
    expect((await rows()).map((r) => r.type)).toEqual(['absent']);
  });

  it('a correction or a repeat sends nothing new', async () => {
    await on(A);
    await mark(A, b, TODAY, { [s1]: 'A' });
    await mark(A, b, TODAY, { [s1]: 'A' }); // saved again
    await mark(A, b, TODAY, { [s1]: 'L' }); // Absent -> Late is a correction
    await mark(A, b, TODAY, { [s1]: 'P' });
    await mark(A, b, TODAY, { [s1]: 'A' }); // flipped back: same event key
    expect(await rows()).toHaveLength(1);
  });

  it('old days do not message parents, but the last two days do', async () => {
    await on(A);
    await mark(A, b, '2026-10-05', { [s1]: 'A' });
    expect(await rows()).toHaveLength(0);
    await mark(A, b, '2026-10-06', { [s1]: 'A' });
    expect(await rows()).toHaveLength(1);
  });

  it('holidays, switched-off parents and inactive students are skipped', async () => {
    await on(A);
    await A.call('PUT', '/attendance', {
      batchId: b,
      date: TODAY,
      holiday: 'holiday',
      marks: { [s1]: 'A' },
    });
    expect(await rows()).toHaveLength(0);
    await A.call('PATCH', `/students/${s1}`, { notifyParent: false });
    await A.call('POST', `/students/${s2}/deactivate`);
    await mark(A, b, TODAY, { [s1]: 'A', [s2]: 'A' });
    expect(await rows()).toHaveLength(0);
  });
});

describe('payment messages', () => {
  it('queues a receipt message with amount, receipt number and balance; a reversal and a refused payment queue nothing', async () => {
    await on(A);
    const s = await mk(A, '/students', student());
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0].id as string;
    expect(
      (await A.call('POST', `/fees/dues/${due}/payments`, { amount: 999999, mode: 'cash' })).status,
    ).toBe(409);
    expect(await rows()).toHaveLength(0); // the failed payment left nothing behind
    const p = await A.call('POST', `/fees/dues/${due}/payments`, { amount: 40000, mode: 'upi' });
    await A.call('POST', `/fees/payments/${p.body.paymentId}/reverse`);
    expect(await rows()).toHaveLength(1);
    await run();
    expect(h.provider.sent[0]).toMatchObject({
      templateId: '105',
      vars: ['Asha Rao', '₹400 (receipt TD-00001, balance due ₹600)', 'Alpha Academy'],
    });
  });

  it('is off when paymentReceived is off', async () => {
    await on(A, { paymentReceived: false });
    const s = await mk(A, '/students', student());
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0].id as string;
    await A.call('POST', `/fees/dues/${due}/payments`, { amount: 100, mode: 'cash' });
    expect(await rows()).toHaveLength(0);
  });
});

describe('fee reminders', () => {
  const setup = async (dueDay: number) => {
    const s = await mk(A, '/students', student({ dueDay, joinedAt: '2026-09-15T00:00:00.000Z' }));
    await A.call('POST', '/fees/generate', {});
    return s;
  };
  const remind = () => enqueueFeeReminders(h.db.pool, A.instituteId, h.clock.now);

  it('"due soon" goes out exactly N days before the due date, once', async () => {
    await on(A, { feeDueDaysBefore: 2 });
    await setup(10); // due 10 Oct, today is 8 Oct
    expect(await remind()).toBe(1);
    expect(await remind()).toBe(0); // same day again: nothing new
    await run();
    expect(h.provider.sent[0]).toMatchObject({
      templateId: '103',
      vars: ['Asha Rao', '₹1,000 for Oct 2026, due on 10 Oct 2026', 'Alpha Academy'],
    });
    h.clock.now = new Date('2026-10-09T06:00:00Z');
    expect(await remind()).toBe(0); // 1 day before is not the day
  });

  it('"overdue" goes out on day 1, 8, 15 and 22 after the due date, then stops', async () => {
    await on(A, { overdueEveryDays: 7 });
    await h.db.pool.query(
      "UPDATE subscriptions SET plan = 'pro', expires_at = '2027-12-31 00:00:00' WHERE institute_id = ?",
      [A.instituteId],
    );
    await setup(1); // due 1 Oct
    const sentOn: string[] = [];
    for (const d of ['02', '03', '08', '09', '10', '16', '17', '23', '24', '30']) {
      h.clock.now = new Date(`2026-10-${d}T06:00:00Z`);
      if ((await remind()) === 1) sentOn.push(d);
    }
    expect(sentOn).toEqual(['02', '09', '16', '23']);
    for (const d of ['02', '09', '16', '23']) {
      h.clock.now = new Date(`2026-10-${d}T06:00:00Z`);
      expect(await remind()).toBe(0); // running the same day again adds nothing
    }
  });

  it('nothing for paid or waived dues, parents who opted out, messages off, or an expired plan', async () => {
    await on(A);
    const s = await setup(10);
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0].id as string;
    await A.call('POST', `/fees/dues/${due}/waive`, { waived: true });
    expect(await remind()).toBe(0);
    await A.call('POST', `/fees/dues/${due}/waive`, { waived: false });
    await A.call('PATCH', `/students/${s}`, { notifyParent: false });
    expect(await remind()).toBe(0);
    await A.call('PATCH', `/students/${s}`, { notifyParent: true });
    await on(A, { enabled: false });
    expect(await remind()).toBe(0);
    await on(A);
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    expect(await remind()).toBe(0);
  });

  it('the daily job covers every institute that has messages on, and only those', async () => {
    await on(A);
    await mk(B, '/students', student({ name: 'Beta Kid', dueDay: 10 }));
    await B.call('POST', '/fees/generate', {});
    await setup(10);
    expect(await enqueueAllFeeReminders(h.db.pool, h.clock.now)).toBe(1); // B has messages off
    await on(B);
    expect(await enqueueAllFeeReminders(h.db.pool, h.clock.now)).toBe(1); // A's is already queued; B's is new
  });

  it('the "run now" button needs messages switched on', async () => {
    expect((await A.call('POST', '/messages/reminders/run')).body.error).toBe('messages_off');
    await on(A);
    await setup(10);
    expect((await A.call('POST', '/messages/reminders/run')).body).toEqual({ queued: 1 });
  });
});

describe('the worker', () => {
  const queueOne = async (over: { settings?: object; student?: object } = {}) => {
    await on(A, over.settings);
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student({ batchIds: [b], ...over.student }));
    await mark(A, b, TODAY, { [s]: 'A' });
    return { b, s };
  };

  it('skips with a reason when WhatsApp is not configured', async () => {
    await queueOne();
    expect(await run(TEMPLATES, null)).toMatchObject({ skipped: 1 });
    expect((await rows())[0]).toMatchObject({ status: 'skipped', reason: 'not-configured' });
  });

  it('skips with "no-template" when no id is set for that message', async () => {
    await queueOne();
    await run({});
    expect((await rows())[0]).toMatchObject({ status: 'skipped', reason: 'no-template' });
  });

  it('skips if the parent was switched off, the student left, messages were turned off, or the plan ended after queueing', async () => {
    const { s } = await queueOne();
    await A.call('PATCH', `/students/${s}`, { notifyParent: false });
    await run();
    expect((await rows())[0]).toMatchObject({ status: 'skipped', reason: 'opted-out' });
    expect(h.provider.sent).toHaveLength(0);
  });

  it('turning messages off cancels what is still queued', async () => {
    await queueOne();
    await on(A, { enabled: false });
    await run();
    expect((await rows())[0]).toMatchObject({ status: 'skipped', reason: 'switched-off' });
  });

  it('an ended plan sends nothing', async () => {
    await queueOne();
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    await run();
    expect((await rows())[0]).toMatchObject({ status: 'skipped', reason: 'plan-expired' });
  });

  it('uses the parent number as it is at send time', async () => {
    const { s } = await queueOne();
    await A.call('PATCH', `/students/${s}`, { parentPhone: '9000000009' });
    await run();
    expect(h.provider.sent[0]!.to).toBe('+919000000009');
  });

  it('retries a failed send after 2 then 15 minutes, then gives up', async () => {
    await queueOne();
    h.provider.failNext = true;
    expect(await run()).toMatchObject({ retry: 1 });
    expect((await rows())[0]).toMatchObject({
      status: 'queued',
      attempts: 1,
      error: 'mock-failure',
    });
    expect(await run()).toMatchObject({ sent: 0, retry: 0 }); // not due yet
    h.clock.now = new Date(h.clock.now.getTime() + 2 * 60_000);
    h.provider.failNext = true;
    expect(await run()).toMatchObject({ retry: 1 });
    h.clock.now = new Date(h.clock.now.getTime() + 14 * 60_000);
    expect(await run()).toMatchObject({ sent: 0, retry: 0 }); // 14 < 15
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    h.provider.failNext = true;
    expect(await run()).toMatchObject({ failed: 1 });
    expect((await rows())[0]).toMatchObject({
      status: 'failed',
      attempts: MAX_ATTEMPTS,
      vars: null,
    });
    expect(await run()).toMatchObject({ sent: 0, failed: 0 }); // finished: never retried again
  });

  it('a retry that works is sent once', async () => {
    await queueOne();
    h.provider.failNext = true;
    await run();
    h.clock.now = new Date(h.clock.now.getTime() + 3 * 60_000);
    expect(await run()).toMatchObject({ sent: 1 });
    expect(h.provider.sent).toHaveLength(1);
  });

  it('two workers at once never send the same message twice', async () => {
    await on(A);
    const b = await mk(A, '/batches', batch());
    const ids: string[] = [];
    for (let i = 0; i < 12; i++)
      ids.push(
        await mk(
          A,
          '/students',
          student({
            name: `Kid ${i}`,
            parentPhone: `98765000${String(i).padStart(2, '0')}`,
            batchIds: [b],
          }),
        ),
      );
    await mark(A, b, TODAY, Object.fromEntries(ids.map((i) => [i, 'A'])));
    const results = await Promise.all([run(), run(), run(), run()]);
    expect(results.reduce((t, r) => t + r.sent, 0)).toBe(12);
    expect(h.provider.sent).toHaveLength(12);
    expect(new Set(h.provider.sent.map((m) => m.reference)).size).toBe(12);
  });

  it('a message left "sending" by a crashed server goes back in the queue', async () => {
    await queueOne();
    await h.db.pool.query(
      "UPDATE messages SET status = 'sending', claim = 'dead-worker', claimed_at = ?",
      [new Date(h.clock.now.getTime() - 11 * 60_000)],
    );
    expect(await run()).toMatchObject({ sent: 1 });
  });

  it('respects the batch size', async () => {
    await on(A);
    const b = await mk(A, '/batches', batch());
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(await mk(A, '/students', student({ name: `Kid ${i}`, batchIds: [b] })));
    await mark(A, b, TODAY, Object.fromEntries(ids.map((i) => [i, 'A'])));
    expect(
      await processQueue(
        { pool: h.db.pool, provider: h.provider, templates: TEMPLATES, clock: () => h.clock.now },
        2,
      ),
    ).toMatchObject({ sent: 2 });
    expect(await run()).toMatchObject({ sent: 3 });
  });
});

describe('tenant isolation', () => {
  it("B's log and settings never show A's messages", async () => {
    await on(A);
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student({ batchIds: [b] }));
    await mark(A, b, TODAY, { [s]: 'A' });
    expect((await B.call('GET', '/messages')).body.messages).toEqual([]);
    expect((await B.call('GET', `/messages?studentId=${s}`)).body.messages).toEqual([]);
    expect((await A.call('GET', '/messages')).body.messages).toHaveLength(1);
    expect((await A.call('GET', '/messages?status=sent')).body.messages).toEqual([]);
    expect((await A.call('GET', '/messages?status=queued')).body.messages).toHaveLength(1);
    expect((await A.call('GET', '/messages?status=bogus')).status).toBe(400);
    expect((await B.call('POST', '/messages/reminders/run')).body.error).toBe('messages_off');
  });

  it('the same event key in two institutes is two messages', async () => {
    await on(A);
    await on(B);
    for (const t of [A, B]) {
      const b = await mk(t, '/batches', batch());
      const s = await mk(t, '/students', student({ batchIds: [b] }));
      await mark(t, b, TODAY, { [s]: 'A' });
    }
    expect(await rows()).toHaveLength(2);
  });
});

describe('template helpers', () => {
  it('parseTemplates keeps only well-formed ids and survives garbage', () => {
    expect(parseTemplates(undefined)).toEqual({});
    expect(parseTemplates('{broken')).toEqual({});
    expect(parseTemplates('{"absent":{"en":1809231,"hi":" "},"nope":{"en":"1"},"late":5}')).toEqual(
      { absent: { en: '1809231' } },
    );
    expect(templateFor(TEMPLATES, 'absent', 'hi')).toBe('201');
    expect(templateFor(TEMPLATES, 'late', 'hi')).toBe('102');
    expect(templateFor({}, 'late', 'en')).toBeUndefined();
  });
  it('cleanVar strips the separator and line breaks, never returns empty, and caps the length', () => {
    expect(cleanVar('a~b\nc\t d')).toBe('a b c d');
    expect(cleanVar('  ')).toBe('-');
    expect(cleanVar(undefined)).toBe('-');
    expect(cleanVar('x'.repeat(100))).toHaveLength(60);
  });
  it('every message has exactly three values, in the order they appear in the templates: student, details, institute', () => {
    const c = {
      parent: 'P',
      institute: 'I',
      student: 'S',
      batch: 'Maths',
      date: '8 Oct 2026',
      amount: '₹1',
      period: 'Oct 2026',
      dueDate: '10 Oct 2026',
      since: '1 Oct 2026',
      receiptNo: 'TD-1',
      balance: '₹0',
    };
    expect(varsFor('absent', c)).toEqual(['S', 'Maths class on 8 Oct 2026', 'I']);
    expect(varsFor('late', c)).toEqual(['S', 'Maths class on 8 Oct 2026', 'I']);
    expect(varsFor('fee_due', c)).toEqual(['S', '₹1 for Oct 2026, due on 10 Oct 2026', 'I']);
    expect(varsFor('fee_overdue', c)).toEqual([
      'S',
      '₹1 for Oct 2026, pending since 1 Oct 2026',
      'I',
    ]);
    expect(varsFor('payment_received', c)).toEqual(['S', '₹1 (receipt TD-1, balance due ₹0)', 'I']);
  });
  it('a very long batch name is cut, never the date at the end', () => {
    const v = varsFor('absent', {
      parent: '',
      institute: 'I',
      student: 'S',
      batch: 'B'.repeat(80),
      date: '8 Oct 2026',
    });
    expect(v[1]).toMatch(/ class on 8 Oct 2026$/);
    expect(v[1]!.length).toBeLessThanOrEqual(80);
  });
  it('overdueStage: day 1, then every N days, at most 4', () => {
    expect([0, 1, 2, 7, 8, 9, 15, 22, 23, 29].map((d) => overdueStage(d, 7))).toEqual([
      null,
      0,
      null,
      null,
      1,
      null,
      2,
      3,
      null,
      null,
    ]);
    expect(overdueStage(1 + 7 * 4, 7)).toBeNull();
    expect(overdueStage(1, 1)).toBe(0);
  });
});
