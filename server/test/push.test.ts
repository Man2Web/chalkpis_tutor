import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { signId } from '../src/billing/payLink.js';
import { queuePlanReminders } from '../src/messaging/centreMessages.js';
import { MockPushSender } from '../src/push/expo.js';
import { attendanceNudges } from '../src/push/nudges.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const SECRET = 'test-jwt-secret-test-jwt-secret-1234';
const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';
const push = new MockPushSender();
let h: Harness;
let A: Tenant;

beforeAll(async () => {
  h = await startHarness({}, { push });
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  push.sent = [];
  A = await h.tenant('+919800000001', { tutor: 'Kiran', institute: 'Kiran Karate Academy' });
  expect(
    (await A.call('POST', '/me/push-token', { token: TOKEN, platform: 'android' })).status,
  ).toBe(204);
});

describe('push notifications', () => {
  it('registers a device token, refuses junk, and removes it at sign-out', async () => {
    expect(
      (await A.call('POST', '/me/push-token', { token: 'nope', platform: 'ios' })).status,
    ).toBe(400);
    expect((await A.call('POST', '/me/push-token/remove', { token: TOKEN })).status).toBe(204);
    const [rows] = (await h.db.pool.query('SELECT COUNT(*) AS n FROM push_tokens')) as unknown as [
      { n: number }[],
    ];
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('tells the owner when a parent says they paid, once per report', async () => {
    const s = await A.call('POST', '/students', {
      name: 'Riya Sharma',
      parentPhone: '9876543210',
      monthlyFee: 150000,
    });
    await A.call('POST', '/fees/generate', { period: '2026-10' });
    const report = () =>
      h.app.inject({
        method: 'POST',
        url: `/f/${signId(SECRET, 'paid', s.body.id)}`,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'ref=',
      });
    await report();
    await report();
    await new Promise((r) => setTimeout(r, 50)); // the push is sent after the answer
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      to: TOKEN,
      title: 'Payment reported',
      body: "Riya Sharma's parent says they paid ₹1,500. Tap to confirm.",
      data: { screen: 'Home' },
    });
  });

  it('nudges about a batch that ended today without attendance, once a day', async () => {
    // the harness clock is Thursday 8 Oct 2026, 11:30 IST
    const b = await A.call('POST', '/batches', {
      name: 'Kids Beginners',
      subject: 'Karate',
      class: 'Beginners',
      days: ['thu'],
      startTime: '09:00',
      endTime: '10:00',
      defaultFee: 100000,
    });
    expect(b.status).toBe(201);
    await A.call('POST', '/batches', {
      name: 'Later',
      subject: 'Karate',
      class: 'Advanced',
      days: ['thu'],
      startTime: '18:00',
      endTime: '19:00',
      defaultFee: 100000,
    });
    expect(await attendanceNudges(h.db.pool, push, h.clock.now)).toBe(1);
    expect(await attendanceNudges(h.db.pool, push, h.clock.now)).toBe(0);
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({
      title: 'Attendance not marked',
      body: 'Kids Beginners has not been marked today. It takes a few seconds.',
      data: { screen: 'Attendance' },
    });
  });

  it('tells the owner when the trial is ending, alongside the WhatsApp reminder', async () => {
    await h.db.pool.query('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [
      new Date(h.clock.now.getTime() + 86_400_000),
      A.instituteId,
    ]);
    await queuePlanReminders(h.db.pool, h.clock.now, {
      baseUrl: 'https://tutor.chalkpis.com',
      secret: SECRET,
      push,
    });
    expect(push.sent[0]).toMatchObject({
      title: 'Your free trial ends on 9 Oct 2026',
      data: { screen: 'Billing' },
    });
  });
});
