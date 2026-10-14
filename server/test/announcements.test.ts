import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dispatchDuePushes, pushTime } from '../src/announcements/service.js';
import { MockPushSender } from '../src/push/expo.js';
import { NOW, startHarness, type Harness, type Tenant } from './helpers.js';

const push = new MockPushSender();
let h: Harness;
let A: Tenant; // owner, tuition, on trial
let B: Tenant; // owner, karate, paying
let helper: Tenant;
let admin: Tenant;
const OWNER_A = 'ExponentPushToken[ownerA000000001]';
const OWNER_B = 'ExponentPushToken[ownerB000000001]';
const HELPER = 'ExponentPushToken[helper000000001]';

beforeAll(async () => {
  h = await startHarness({}, { push });
});
afterAll(() => h.close());

/** Everyone signed in at the harness clock's time (tokens last 15 minutes from then). */
async function people() {
  push.sent = [];
  A = await h.tenant('+919800000001', { tutor: 'Asha', institute: 'Asha Tuition' });
  B = await h.tenant('+919800000002', { tutor: 'Kiran', institute: 'Kiran Karate' });
  await B.call('PATCH', '/institute', { category: 'karate' });
  await h.db.pool.query(
    "UPDATE subscriptions SET plan = 'pro', status = 'active', expires_at = DATE_ADD(?, INTERVAL 300 DAY) WHERE institute_id = ?",
    [h.clock.now, B.instituteId],
  );
  const r = await A.call('POST', '/staff', { phone: '9876511111', name: 'Helper One' });
  helper = h.login(r.body.id as string, A.instituteId);
  await A.call('POST', '/me/push-token', { token: OWNER_A, platform: 'android' });
  await B.call('POST', '/me/push-token', { token: OWNER_B, platform: 'ios' });
  await helper.call('POST', '/me/push-token', { token: HELPER, platform: 'android' });
  admin = await h.admin();
}

const create = (body: object) => admin.call('POST', '/admin/api/announcements', body);
const tokensSent = () => push.sent.map((m) => m.to).sort();

describe('announcements: targeting, push and quiet hours', () => {
  beforeEach(async () => {
    await h.reset();
    h.clock.now = new Date(NOW); // 11:30 IST
    await people();
  });

  it('targets by role, plan and kind of centre; estimates the audience first', async () => {
    expect(
      (await admin.call('POST', '/admin/api/announcements/estimate', { audience: 'all' })).body,
    ).toEqual({ people: 3, phones: 3 });
    expect(
      (
        await admin.call('POST', '/admin/api/announcements/estimate', {
          audience: 'owners',
          plan: 'paid',
        })
      ).body,
    ).toEqual({ people: 1, phones: 1 });

    // owners on a trial get it as a push now, with the announcement id to open it
    const r = await create({
      title: 'Your trial: 3 tips',
      body: 'Add students, mark attendance, send reminders.',
      category: 'tip',
      audience: 'owners',
      plan: 'trial',
      push: true,
    });
    expect(r.status).toBe(201);
    expect(r.body.audience).toBe(1);
    expect(push.sent).toEqual([
      {
        to: OWNER_A,
        title: 'Your trial: 3 tips',
        body: 'Add students, mark attendance, send reminders.',
        data: { screen: 'Updates', announcementId: r.body.id },
      },
    ]);
    const listed = (await admin.call('GET', '/admin/api/announcements')).body;
    expect(listed.announcements[0]).toMatchObject({
      pushStatus: 'sent',
      pushPhones: 1,
      pushSent: 1,
      audienceSize: 1,
      status: 'live',
      category: 'tip',
      tone: 'info',
    });

    // karate centres only: Kiran, not Asha or her helper
    push.sent = [];
    await create({ title: 'Belt grading reports', centreCategory: 'karate', push: true });
    expect(tokensSent()).toEqual([OWNER_B]);
    // helpers only
    push.sent = [];
    await create({ title: 'Marking attendance is faster now', audience: 'staff', push: true });
    expect(tokensSent()).toEqual([HELPER]);
  });

  it('a push published at night waits for 8 am, unless it is critical', async () => {
    await h.reset(); // (puts the clock back to the morning)
    h.clock.now = new Date('2026-10-08T17:00:00Z'); // 22:30 IST
    await people();
    const r = await create({ title: 'New: fee reports', category: 'feature', push: true });
    expect(push.sent).toHaveLength(0);
    expect(r.body.pushAt).toBe('2026-10-09T02:30:00.000Z'); // 8:00 IST the next morning
    expect((await admin.call('GET', '/admin/api/announcements')).body.summary.scheduled).toBe(1);
    // the worker sends it when it is due, once
    expect(await dispatchDuePushes(h.db.pool, push, new Date('2026-10-09T02:00:00Z'))).toBe(0);
    expect(await dispatchDuePushes(h.db.pool, push, new Date('2026-10-09T02:31:00Z'))).toBe(1);
    expect(await dispatchDuePushes(h.db.pool, push, new Date('2026-10-09T02:32:00Z'))).toBe(0);
    expect(push.sent).toHaveLength(3);

    push.sent = [];
    await create({
      title: 'Service restored',
      category: 'maintenance',
      priority: 'critical',
      push: true,
    });
    expect(push.sent).toHaveLength(3); // critical: straight away
    expect(pushTime(new Date('2026-10-08T03:00:00Z'), 'normal').toISOString()).toBe(
      '2026-10-08T03:00:00.000Z', // 8:30 IST is within the day
    );
  });

  it('scheduled for later; taking it down before then cancels the push', async () => {
    const later = new Date(h.clock.now.getTime() + 2 * 3_600_000).toISOString();
    const r = await create({ title: 'Maintenance on Sunday', startsAt: later, push: true });
    expect(push.sent).toHaveLength(0);
    expect((await A.call('GET', '/announcements')).body.announcements).toEqual([]); // not started yet
    await admin.call('POST', `/admin/api/announcements/${r.body.id}/end`);
    expect(await dispatchDuePushes(h.db.pool, push, new Date(Date.parse(later) + 60_000))).toBe(0);
    expect(
      (await admin.call('GET', '/admin/api/announcements')).body.announcements[0],
    ).toMatchObject({
      pushStatus: 'cancelled',
      status: 'ended',
    });
  });

  it('a test push goes to one number only', async () => {
    const r = await admin.call('POST', '/admin/api/announcements/test-push', {
      phone: '98000 00002',
      title: 'Test',
      body: 'Hello',
    });
    expect(r.body).toEqual({ found: true, phones: 1, sent: 1 });
    expect(tokensSent()).toEqual([OWNER_B]);
    expect(
      (
        await admin.call('POST', '/admin/api/announcements/test-push', {
          phone: '9111111111',
          title: 'Test',
        })
      ).body,
    ).toMatchObject({ found: false });
  });

  it('blocked people are never targeted', async () => {
    await h.db.pool.query('UPDATE users SET blocked_at = NOW() WHERE id = ?', [B.userId]);
    await create({ title: 'To everyone', push: true });
    expect(tokensSent()).toEqual([HELPER, OWNER_A].sort());
  });
});

describe('announcements in the app: banner, Updates inbox, and what people did', () => {
  beforeEach(async () => {
    await h.reset();
    h.clock.now = new Date(NOW);
    await people();
  });

  it('shows the banner and keeps it in Updates; seen, clicked, dismissed and opened are counted', async () => {
    const a = (
      await create({
        title: 'New: poster maker',
        body: 'Make topper posters in seconds.',
        category: 'feature',
        priority: 'important',
        ctaLabel: 'Try it',
        screen: 'Home',
        audience: 'owners',
      })
    ).body;
    const quiet = (await create({ title: 'In Updates only', banner: false, audience: 'owners' }))
      .body;

    const banner = (await A.call('GET', '/announcements')).body.announcements;
    expect(banner).toEqual([
      expect.objectContaining({
        id: a.id,
        title: 'New: poster maker',
        tone: 'success',
        category: 'feature',
        priority: 'important',
        ctaLabel: 'Try it',
        screen: 'Home',
        read: false,
      }),
    ]);
    expect((await helper.call('GET', '/announcements')).body.announcements).toEqual([]);

    let inbox = (await A.call('GET', '/me/updates')).body;
    expect(inbox.unread).toBe(2);
    expect(inbox.updates.map((u: { id: string }) => u.id).sort()).toEqual([a.id, quiet.id].sort());

    await A.call('POST', `/announcements/${a.id}/events`, { type: 'clicked' });
    await A.call('POST', `/announcements/${a.id}/events`, { type: 'dismissed' });
    await B.call('POST', `/announcements/${a.id}/events`, { type: 'opened' });
    expect((await A.call('POST', `/announcements/${a.id}/events`, { type: 'nope' })).status).toBe(
      400,
    );

    // dismissed: no banner any more, but still in Updates, now read
    expect((await A.call('GET', '/announcements')).body.announcements).toEqual([]);
    inbox = (await A.call('GET', '/me/updates')).body;
    expect(inbox.unread).toBe(1);
    await A.call('POST', '/me/updates/read-all');
    expect((await A.call('GET', '/me/updates')).body.unread).toBe(0);

    const row = (await admin.call('GET', '/admin/api/announcements')).body.announcements.find(
      (x: { id: string }) => x.id === a.id,
    );
    expect(row.stats).toEqual({ seen: 2, clicked: 1, dismissed: 1, opened: 1 });
  });

  it('older dashboards still work: a colour and the old fields are accepted', async () => {
    const r = await create({ title: 'Hello', tone: 'warning', audience: 'all', days: 1 });
    expect(r.status).toBe(201);
    expect((await A.call('GET', '/announcements')).body.announcements[0]).toMatchObject({
      title: 'Hello',
      tone: 'warning',
      link: '',
    });
    expect((await create({ title: 'x', link: 'http://insecure' })).status).toBe(400);
  });
});
