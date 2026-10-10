import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { healthScore } from '../src/admin/analytics.js';
import { toCsv } from '../src/admin/ops.js';
import { parseTemplates } from '../src/messaging/templates.js';
import { processQueue } from '../src/messaging/worker.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const ADMIN = '+919000000001';
let h: Harness;
let admin: Tenant;
let A: Tenant;
beforeAll(async () => {
  h = await startHarness({ ADMIN_PHONES: [ADMIN] });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  h.provider.sent.length = 0;
  admin = await h.tenant(ADMIN, { institute: 'HQ' });
  A = await h.tenant('+919876543210', { tutor: 'Asha', institute: 'Alpha Academy' });
  await h.tenant('+919123456789', { tutor: 'Bala', institute: 'Beta Classes' });
});

const student = (t: Tenant, name = 'Kid One') =>
  t.call('POST', '/students', {
    name,
    parentPhone: '9876500001',
    monthlyFee: 100000,
    joinedAt: '2026-09-01T00:00:00.000Z',
  });

describe('next-level admin', () => {
  it('every new admin route is admin-only', async () => {
    for (const url of [
      '/admin/api/analytics',
      '/admin/api/institutes',
      `/admin/api/institutes/${A.instituteId}`,
      '/admin/api/messages',
      '/admin/api/health',
      '/admin/api/announcements',
      '/admin/api/search?q=as',
      '/admin/api/export/users.csv',
      '/admin/api/export/institutes.csv',
    ]) {
      expect((await A.call('GET', url)).status, url).toBe(403);
      expect((await admin.call('GET', url)).status, url).toBe(200);
    }
  });

  it('analytics gives a daily series per metric and totals against the previous period', async () => {
    const s = (await student(A)).body.id;
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0];
    await A.call('POST', `/fees/dues/${due.id}/payments`, { amount: 60000, mode: 'upi' });
    const r = (await admin.call('GET', '/admin/api/analytics?days=7')).body;
    expect(r.dates).toHaveLength(7);
    expect(r.series.feesRecorded).toHaveLength(7);
    expect(r.totals.feesRecorded.now).toBe(60000);
    expect(r.totals.activeInstitutes.now).toBe(1);
    expect(r.funnel).toMatchObject({ institutes: 3, withStudents: 1, withPayments: 1 });
    expect(r.plans).toContainEqual({ plan: 'trial', active: 3, ended: 0 });
    expect(r.retention.active7).toBe(1);
    expect((await admin.call('GET', '/admin/api/analytics?days=500')).status).toBe(400);
  });

  it('lists centres with a health score, searches, filters at-risk and shows one centre in depth', async () => {
    await A.call('PATCH', '/institute', { upiId: 'alpha@oksbi' });
    await student(A);
    const list = (await admin.call('GET', '/admin/api/institutes?sort=students')).body.institutes;
    expect(list[0]).toMatchObject({ name: 'Alpha Academy', students: 1, canBePaid: true });
    expect(list[0].health).toBeGreaterThan(list[1].health);
    expect(list[0].owner).toMatchObject({ name: 'Asha', phone: '+919876543210' });
    const found = (await admin.call('GET', '/admin/api/institutes?q=Beta')).body.institutes;
    expect(found.map((i: { name: string }) => i.name)).toEqual(['Beta Classes']);
    const risky = (await admin.call('GET', '/admin/api/institutes?filter=at-risk')).body.institutes;
    expect(risky.map((i: { name: string }) => i.name)).toContain('Beta Classes'); // nothing set up yet
    const d = (await admin.call('GET', `/admin/api/institutes/${A.instituteId}`)).body;
    expect(d.people).toEqual([expect.objectContaining({ name: 'Asha', role: 'owner' })]);
    expect(d.activity).toMatchObject({ attendance30: 0, payments30: 0 });
  });

  it('health score rewards recent use, students, a way to pay and messages on', () => {
    const now = new Date('2026-10-10T00:00:00Z');
    expect(
      healthScore({ lastActivity: now, students: 20, canBePaid: true, messagesOn: true, now }),
    ).toBe(100);
    expect(
      healthScore({ lastActivity: null, students: 0, canBePaid: false, messagesOn: false, now }),
    ).toBe(0);
    expect(
      healthScore({
        lastActivity: new Date('2026-09-01T00:00:00Z'),
        students: 3,
        canBePaid: false,
        messagesOn: false,
        now,
      }),
    ).toBe(15);
  });

  it('the WhatsApp monitor shows failures with their reason, and a failed message can be retried', async () => {
    const s = (await student(A)).body.id;
    await A.call('POST', '/fees/generate', {});
    const rem = await A.call('POST', `/students/${s}/remind`);
    expect(rem.status, JSON.stringify(rem.body)).toBe(202);
    const templates = parseTemplates(
      JSON.stringify({ fee_overdue: { en: 'tutordesk_fee_overdue' } }),
    );
    for (let i = 0; i < 3; i++) {
      h.provider.failNext = true;
      await processQueue({
        pool: h.db.pool,
        provider: h.provider,
        templates,
        clock: () => h.clock.now,
      });
      h.clock.now = new Date(h.clock.now.getTime() + 20 * 60_000);
    }
    admin = h.login(admin.userId, admin.instituteId); // the clock moved past the old token
    const monR = await admin.call('GET', '/admin/api/messages?status=failed');
    expect(monR.status, JSON.stringify(monR.body)).toBe(200);
    const mon = monR.body;
    expect(mon.messages).toHaveLength(1);
    expect(mon.messages[0]).toMatchObject({
      type: 'fee_overdue',
      status: 'failed',
      why: 'mock-failure',
      institute: 'Alpha Academy',
      manual: true,
    });
    expect(mon.messages[0].to).toBe('•••• 0001');
    expect(mon.topErrors[0]).toEqual({ error: 'mock-failure', count: 1 });
    expect(
      (await admin.call('POST', `/admin/api/messages/${mon.messages[0].id}/retry`)).status,
    ).toBe(200);
    await processQueue({
      pool: h.db.pool,
      provider: h.provider,
      templates,
      clock: () => h.clock.now,
    });
    expect(h.provider.sent).toHaveLength(1);
    expect(
      (await admin.call('POST', `/admin/api/messages/${mon.messages[0].id}/retry`)).body.error,
    ).toBe('not_failed');
  });

  it('system health reports the database, queue, WhatsApp setup and server', async () => {
    const r = (await admin.call('GET', '/admin/api/health')).body;
    expect(r.database.ok).toBe(true);
    expect(r.database.lastMigration).toMatch(/^\d{3}_/);
    expect(r.queue).toMatchObject({ queued: 0, failed24h: 0 });
    expect(r.whatsapp.provider).toBe('mock');
    expect(r.server.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('announcements go live for the chosen audience and can be taken down', async () => {
    const helper = (await A.call('POST', '/staff', { phone: '9876511111', name: 'Helper' })).body;
    const staff = h.login(helper.id ?? helper.userId, A.instituteId);
    const r = await admin.call('POST', '/admin/api/announcements', {
      title: 'New: poster maker',
      body: 'Make topper posters in seconds.',
      tone: 'success',
      audience: 'owners',
      days: 7,
    });
    expect(r.status).toBe(201);
    expect((await A.call('GET', '/announcements')).body.announcements).toEqual([
      expect.objectContaining({ title: 'New: poster maker', tone: 'success' }),
    ]);
    expect((await staff.call('GET', '/announcements')).body.announcements).toEqual([]);
    expect(
      (
        await admin.call('POST', '/admin/api/announcements', {
          title: 'x',
          link: 'http://insecure',
        })
      ).status,
    ).toBe(400);
    await admin.call('POST', `/admin/api/announcements/${r.body.id}/end`);
    expect((await A.call('GET', '/announcements')).body.announcements).toEqual([]);
    expect((await admin.call('GET', '/admin/api/announcements')).body.announcements[0].live).toBe(
      false,
    );
  });

  it('quick search finds logins and centres; exports are spreadsheet-safe CSV', async () => {
    const r = (await admin.call('GET', '/admin/api/search?q=Alpha')).body;
    expect(r.institutes.map((i: { name: string }) => i.name)).toEqual(['Alpha Academy']);
    expect((await admin.call('GET', '/admin/api/search?q=asha')).body.users[0].phone).toBe(
      '+919876543210',
    );
    const csv = await h.app.inject({
      url: '/admin/api/export/institutes.csv',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Alpha Academy');
    expect(toCsv([['=HYPERLINK("x")', 'a,b', '+91']])).toBe('﻿"\'=HYPERLINK(""x"")","a,b",\'+91');
  });
});
