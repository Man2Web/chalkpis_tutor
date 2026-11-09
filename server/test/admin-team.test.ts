import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockMailer } from '../src/auth/mailer.js';
import { newId } from '../src/lib/ids.js';
import { meterLoginCode, meterSend } from '../src/messaging/meter.js';
import { warnLowBalance } from '../src/admin/waSpend.js';
import { startHarness, TEST_ADMIN_EMAIL, type Harness, type Tenant } from './helpers.js';

const mailer = new MockMailer();
let h: Harness;
let A: Tenant;
let B: Tenant;
beforeAll(async () => {
  h = await startHarness({ OTP_DEV_ECHO: true }, { mailer });
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  mailer.sent = [];
  A = await h.tenant('+919876543210', { tutor: 'Test Tutor', institute: 'Demo Classes' });
  B = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' });
});

/** A team member with a live session (the harness signs them in; the role is set like the Team page does). */
async function member(email: string, role: 'admin' | 'support') {
  const t = await h.admin(email);
  await h.db.pool.query('UPDATE admin_accounts SET role = ?, name = ? WHERE email = ?', [
    role,
    role === 'admin' ? 'Vignesh' : 'Sanjay',
    email,
  ]);
  return t;
}
const count = async (sql: string, args: unknown[] = []) => {
  const [[r]] = (await h.db.pool.query(sql, args)) as unknown as [[{ n: number }]];
  return Number(r!.n);
};

describe('roles: super admin, admin, customer support', () => {
  it('each role sees what it needs and is refused the rest', async () => {
    const support = await member('sanjay@chalkpis.test', 'support');
    const admin = await member('vignesh@chalkpis.test', 'admin');
    const owner = await h.admin();

    expect((await support.call('GET', '/admin/auth/me')).body).toMatchObject({
      role: 'support',
      roleLabel: 'Customer support',
      caps: ['view', 'help'],
    });
    expect((await owner.call('GET', '/admin/auth/me')).body.role).toBe('super');

    // support: looks things up and helps, nothing more
    expect((await support.call('GET', '/admin/api/institutes')).status).toBe(200);
    expect((await support.call('GET', `/admin/api/institutes/${A.instituteId}`)).status).toBe(200);
    expect((await support.call('POST', `/admin/api/users/${A.userId}/sign-out`)).status).toBe(200);
    expect(
      (
        await support.call('POST', `/admin/api/institutes/${A.instituteId}/notes`, {
          body: 'Called',
        })
      ).status,
    ).toBe(201);
    for (const [m, url, body] of [
      ['POST', `/admin/api/institutes/${A.instituteId}/plan`, { plan: 'pro', days: 30 }],
      ['POST', `/admin/api/users/${A.userId}/block`, {}],
      ['GET', '/admin/api/billing', undefined],
      ['GET', '/admin/api/export/users.csv', undefined],
      ['GET', '/admin/api/audit', undefined],
      ['GET', '/admin/api/team', undefined],
      ['POST', '/admin/api/deletions/preview', { kind: 'centre', ids: [A.instituteId] }],
    ] as const) {
      const r = await support.call(m, url, body);
      expect(r.status, url).toBe(403);
      expect(r.body.error).toBe('not_allowed');
    }
    // analytics without the company's revenue
    const an = (await support.call('GET', '/admin/api/analytics')).body;
    expect(an.series.revenue).toBeUndefined();
    expect(an.revenueByMonth).toEqual([]);
    expect((await owner.call('GET', '/admin/api/analytics')).body.series.revenue).toBeDefined();

    // admin: runs everything but the team
    expect(
      (
        await admin.call('POST', `/admin/api/institutes/${A.instituteId}/plan`, {
          plan: 'pro',
          days: 30,
        })
      ).status,
    ).toBe(200);
    expect((await admin.call('GET', '/admin/api/billing')).status).toBe(200);
    expect((await admin.call('GET', '/admin/api/team')).status).toBe(403);
    expect((await owner.call('GET', '/admin/api/team')).status).toBe(200);
  });

  it('the super admin adds a member, who sets a password and signs in; removing them ends access at once', async () => {
    const owner = await h.admin();
    const add = await owner.call('POST', '/admin/api/team', {
      email: 'New.Person@Chalkpis.test',
      name: 'New Person',
      role: 'support',
    });
    expect(add.status).toBe(201);
    expect(add.body.emailed).toBe(true);
    const invite = mailer.sent.find((m) => m.to === 'new.person@chalkpis.test')!;
    expect(invite.subject).toBe('You have been added to Chalkpis Admin');
    expect(invite.text).toContain('Customer support');
    expect(invite.text).toContain('First time? Set a password');
    // the same email again, or a super admin's, is refused
    expect(
      (
        await owner.call('POST', '/admin/api/team', {
          email: 'new.person@chalkpis.test',
          role: 'admin',
        })
      ).body.error,
    ).toBe('already_member');
    expect(
      (await owner.call('POST', '/admin/api/team', { email: TEST_ADMIN_EMAIL, role: 'admin' })).body
        .error,
    ).toBe('already_super_admin');

    // they set a password with the emailed code and sign in
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    const post = (url: string, payload: object) =>
      h.app.inject({ method: 'POST', url, payload, remoteAddress: '198.51.100.77' });
    const code = (await post('/admin/auth/forgot', { email: 'new.person@chalkpis.test' })).json()
      .devCode;
    const password = 'Green!Lamp#Ocean58';
    expect(
      (await post('/admin/auth/reset', { email: 'new.person@chalkpis.test', code, password }))
        .statusCode,
    ).toBe(200);
    const s1 = (
      await post('/admin/auth/login', { email: 'new.person@chalkpis.test', password })
    ).json();
    const s2 = (
      await post('/admin/auth/verify', {
        email: 'new.person@chalkpis.test',
        challenge: s1.challenge,
        code: s1.devCode,
      })
    ).json();
    const me = await h.app.inject({
      url: '/admin/auth/me',
      headers: { authorization: `Bearer ${s2.token}` },
    });
    expect(me.json()).toMatchObject({ email: 'new.person@chalkpis.test', role: 'support' });

    const team = (await owner.call('GET', '/admin/api/team')).body.team;
    expect(
      team.map((m: { email: string; role: string; status: string }) => [m.email, m.role, m.status]),
    ).toEqual([
      [TEST_ADMIN_EMAIL, 'super', 'invited'],
      ['new.person@chalkpis.test', 'support', 'active'],
    ]);
    const id = team[1].id;
    // a super admin cannot be changed from the dashboard
    expect((await owner.call('DELETE', `/admin/api/team/${team[0].id}`)).body.error).toBe(
      'cannot_change_super_admin',
    );
    // promoted: works from the next click
    expect((await owner.call('PUT', `/admin/api/team/${id}`, { role: 'admin' })).status).toBe(200);
    const me2 = await h.app.inject({
      url: '/admin/auth/me',
      headers: { authorization: `Bearer ${s2.token}` },
    });
    expect(me2.json().role).toBe('admin');
    // removed: the open session stops, and signing in again is refused like a wrong password
    expect((await owner.call('DELETE', `/admin/api/team/${id}`)).status).toBe(200);
    const me3 = await h.app.inject({
      url: '/admin/auth/me',
      headers: { authorization: `Bearer ${s2.token}` },
    });
    expect(me3.statusCode).toBe(401);
    expect(
      (await post('/admin/auth/login', { email: 'new.person@chalkpis.test', password })).statusCode,
    ).toBe(401);
    // added back later: the old password does not come back with them; they set a new one
    expect(
      (
        await owner.call('POST', '/admin/api/team', {
          email: 'new.person@chalkpis.test',
          role: 'support',
        })
      ).status,
    ).toBe(201);
    expect(
      (await post('/admin/auth/login', { email: 'new.person@chalkpis.test', password })).statusCode,
    ).toBe(401);
    expect(
      (await owner.call('GET', '/admin/api/team')).body.team.find(
        (m: { email: string }) => m.email === 'new.person@chalkpis.test',
      ).status,
    ).toBe('invited');
    // and it is all in the audit log
    const actions = (await owner.call('GET', '/admin/api/audit')).body.audit.map(
      (a: { action: string }) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['team-add', 'team-change', 'team-remove']));
  });
});

describe('deleting test centres and people needs the code emailed to the super admin', () => {
  it('an admin asks, the code goes only to the super admin, and only that code deletes', async () => {
    const admin = await member('vignesh@chalkpis.test', 'admin');
    // a helper at the test centre, and a student with a fee payment
    const helper = newId();
    await h.db.pool.query(
      "INSERT INTO users (id, phone, name) VALUES (?, '+919000000001', 'Helper')",
      [helper],
    );
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [helper, A.instituteId],
    );
    const student = await A.call('POST', '/students', {
      name: 'Ravi',
      parentPhone: '9811111111',
      monthlyFee: 50000,
      joinedAt: '2026-09-01T00:00:00.000Z',
    });
    expect(student.status).toBe(201);

    const preview = await admin.call('POST', '/admin/api/deletions/preview', {
      kind: 'centre',
      ids: [A.instituteId],
    });
    expect(preview.body.items[0]).toMatchObject({
      name: 'Demo Classes',
      owner: 'Test Tutor',
      students: 1,
      helpers: 1,
      blocker: null,
    });

    const ask = await admin.call('POST', '/admin/api/deletions', {
      kind: 'centre',
      ids: [A.instituteId],
      reason: 'Test sign-up',
    });
    expect(ask.status).toBe(201);
    expect(ask.body.sentTo).toEqual(['a•••@chalkpis.test']);
    // emailed to the super admin, never to the admin who asked
    expect(mailer.sent.map((m) => m.to)).toEqual([TEST_ADMIN_EMAIL]);
    const mail = mailer.sent[0]!;
    expect(mail.subject).toBe(`${ask.body.devCode} is the code to delete 1 centre from Chalkpis`);
    expect(mail.text).toContain('Vignesh (Admin, vignesh@chalkpis.test) asked to delete 1 centre:');
    // every target is listed in full, numbered, with its warnings
    expect(mail.text).toMatch(/\n1\. Demo Classes \(owner .*; 1 students, 1 helpers\)/);
    expect(mail.text).toContain('Reason: Test sign-up.');

    // someone else cannot use the request, and a wrong code counts a try
    const other = await member('sanjay2@chalkpis.test', 'admin');
    expect(
      (
        await other.call('POST', `/admin/api/deletions/${ask.body.id}/confirm`, {
          code: ask.body.devCode,
        })
      ).status,
    ).toBe(404);
    const wrong = await admin.call('POST', `/admin/api/deletions/${ask.body.id}/confirm`, {
      code: ask.body.devCode === '000000' ? '111111' : '000000',
    });
    expect(wrong.body).toMatchObject({ error: 'invalid_code', triesLeft: 4 });
    expect(await count('SELECT COUNT(*) n FROM institutes WHERE id = ?', [A.instituteId])).toBe(1);

    const ok = await admin.call('POST', `/admin/api/deletions/${ask.body.id}/confirm`, {
      code: ask.body.devCode,
    });
    expect(ok.body).toEqual({ deleted: 1, skipped: [] });
    expect(await count('SELECT COUNT(*) n FROM institutes WHERE id = ?', [A.instituteId])).toBe(0);
    expect(await count('SELECT COUNT(*) n FROM users WHERE id IN (?)', [[A.userId, helper]])).toBe(
      0,
    );
    expect(
      await count('SELECT COUNT(*) n FROM students WHERE institute_id = ?', [A.instituteId]),
    ).toBe(0);
    // the other centre is untouched
    expect(await count('SELECT COUNT(*) n FROM institutes WHERE id = ?', [B.instituteId])).toBe(1);
    // the code works once
    expect(
      (
        await admin.call('POST', `/admin/api/deletions/${ask.body.id}/confirm`, {
          code: ask.body.devCode,
        })
      ).body.error,
    ).toBe('code_expired');
    expect(mailer.sent.at(-1)!.subject).toBe('Deleted 1 centre from Chalkpis');
    const [audit] = (await h.db.pool.query(
      "SELECT admin_phone, detail FROM admin_audit WHERE action = 'delete-centre'",
    )) as unknown as [{ admin_phone: string; detail: string }[]];
    expect(audit).toEqual([
      {
        admin_phone: 'vignesh@chalkpis.test',
        detail: 'Demo Classes · 1 students · 2 logins · Test sign-up',
      },
    ]);
  });

  it('a code expires after 10 minutes; owners go with their centre; auto-renew blocks it', async () => {
    const owner = await h.admin();
    const ask = await owner.call('POST', '/admin/api/deletions', {
      kind: 'centre',
      ids: [B.instituteId],
    });
    expect(mailer.sent[0]!.text).toContain('Enter the code in the dashboard');
    h.clock.now = new Date(h.clock.now.getTime() + 11 * 60_000);
    expect(
      (
        await owner.call('POST', `/admin/api/deletions/${ask.body.id}/confirm`, {
          code: ask.body.devCode,
        })
      ).body.error,
    ).toBe('code_expired');

    // an owner is deleted from the centre, not as a person
    const p = await owner.call('POST', '/admin/api/deletions', { kind: 'person', ids: [B.userId] });
    expect(p.status).toBe(409);
    expect(p.body).toMatchObject({
      error: 'cannot_delete',
      message: 'Owner of Meena Dance: delete the centre instead',
    });

    // a person who never set up a centre goes on their own
    const lone = newId();
    await h.db.pool.query("INSERT INTO users (id, phone) VALUES (?, '+919000000002')", [lone]);
    const q = await owner.call('POST', '/admin/api/deletions', { kind: 'person', ids: [lone] });
    expect(
      (
        await owner.call('POST', `/admin/api/deletions/${q.body.id}/confirm`, {
          code: q.body.devCode,
        })
      ).body,
    ).toEqual({ deleted: 1, skipped: [] });
    expect(await count('SELECT COUNT(*) n FROM users WHERE id = ?', [lone])).toBe(0);

    await h.db.pool.query(
      "INSERT INTO web_subscriptions (id, institute_id, plan_id, cycle, amount, rp_plan_id, status) VALUES ('sub_x', ?, 'standard', 'year', 199900, 'plan_x', 'active')",
      [B.instituteId],
    );
    const r = await owner.call('POST', '/admin/api/deletions', {
      kind: 'centre',
      ids: [B.instituteId],
    });
    expect(r.body.error).toBe('cannot_delete');
  });

  it('the "Test or empty" filter finds try-out centres', async () => {
    const owner = await h.admin();
    const list = (await owner.call('GET', '/admin/api/institutes?filter=test')).body.institutes;
    expect(list.map((i: { name: string }) => i.name)).toEqual(['Demo Classes']);
    await h.db.pool.query('UPDATE institutes SET created_at = ?', [
      new Date(h.clock.now.getTime() - 3 * 86_400_000),
    ]);
    const later = (await owner.call('GET', '/admin/api/institutes?filter=test')).body.institutes;
    expect(later).toHaveLength(2); // Meena Dance: still no students after 2 days
  });
});

describe('WhatsApp spend', () => {
  it('counts each message per centre and kind, prices it, and estimates the balance and days left', async () => {
    const owner = await h.admin();
    const day = (d: number) => new Date(h.clock.now.getTime() - d * 86_400_000);
    // 7 days of 10 fee reminders a day at A and 2 login codes, plus a code to someone not in a centre
    for (let d = 1; d <= 7; d++) {
      for (let i = 0; i < 10; i++)
        await meterSend(h.db.pool, day(d), 'fee_reminder', A.instituteId);
      await meterLoginCode(h.db.pool, day(d), '+919876543210');
      await meterLoginCode(h.db.pool, day(d), '+919876543210');
    }
    await meterLoginCode(h.db.pool, day(1), '+919999999999');

    expect(
      (
        await owner.call('PUT', '/admin/api/wa-spend/rates', {
          utility: 15,
          authentication: 12.5,
          marketing: 80,
          categories: {},
          warnDays: 7,
          warnBelow: 50000,
        })
      ).status,
    ).toBe(200);
    // a balance of Rs 100 read on the gateway today
    await owner.call('POST', '/admin/api/wa-spend/wallet', { kind: 'balance', amount: 10000 });

    const s = (await owner.call('GET', '/admin/api/wa-spend')).body;
    // a day: 10 x 15p + 2 x 12.5p = 175p, plus one 12.5p code outside a centre in the week: 176.8p
    expect(s.wallet).toMatchObject({ status: 'low', balance: 10000, perDay: 177, daysLeft: 56 });
    expect(s.byKind).toEqual([
      {
        kind: 'fee_reminder',
        label: 'Fee reminders (QR)',
        category: 'utility',
        sent: 70,
        paise: 1050,
      },
      {
        kind: 'login_code',
        label: 'Login codes',
        category: 'authentication',
        sent: 15,
        paise: 188,
      },
    ]);
    const centres = (await owner.call('GET', '/admin/api/wa-spend/centres')).body.centres;
    expect(centres).toEqual([
      {
        id: A.instituteId,
        name: 'Demo Classes',
        deleted: false,
        plan: 'trial',
        sent: 84,
        loginCodes: 14,
        paise: 1225,
      },
      {
        id: null,
        name: 'Not in a centre yet',
        deleted: false,
        plan: null,
        sent: 1,
        loginCodes: 1,
        paise: 13,
      },
    ]);
    const one = (await owner.call('GET', `/admin/api/institutes/${A.instituteId}/wa-spend`)).body;
    expect(one).toMatchObject({ sent30: 84, paise30: 1225 });

    // a recharge adds to it; spend today takes from it
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    await owner.call('POST', '/admin/api/wa-spend/wallet', {
      kind: 'recharge',
      amount: 200000,
      note: 'UPI',
    });
    for (let i = 0; i < 4; i++) await meterSend(h.db.pool, h.clock.now, 'absent', B.instituteId);
    const s2 = (await owner.call('GET', '/admin/api/wa-spend')).body.wallet;
    expect(s2.balance).toBe(10000 + 200000 - 60);
    expect(s2.status).toBe('ok');

    // support sees it but cannot change the wallet
    const support = await member('sanjay@chalkpis.test', 'support');
    expect((await support.call('GET', '/admin/api/wa-spend')).status).toBe(200);
    expect(
      (await support.call('POST', '/admin/api/wa-spend/wallet', { kind: 'recharge', amount: 1 }))
        .status,
    ).toBe(403);
  });

  it('emails the super admins once a day while the balance is low', async () => {
    const owner = await h.admin();
    for (let d = 1; d <= 7; d++)
      for (let i = 0; i < 100; i++)
        await meterSend(
          h.db.pool,
          new Date(h.clock.now.getTime() - d * 86_400_000),
          'absent',
          A.instituteId,
        );
    await owner.call('POST', '/admin/api/wa-spend/wallet', { kind: 'balance', amount: 5000 });
    expect(await warnLowBalance(h.db.pool, mailer, [TEST_ADMIN_EMAIL], h.clock.now)).toBe(1);
    expect(mailer.sent.at(-1)!.subject).toBe('Recharge the Chalkpis WhatsApp balance soon');
    expect(mailer.sent.at(-1)!.text).toContain('Rs 20 a day');
    // not again the same day
    expect(await warnLowBalance(h.db.pool, mailer, [TEST_ADMIN_EMAIL], h.clock.now)).toBe(0);
  });

  it('a sent parent message and a login code are metered by the server itself', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '9876543210' },
    });
    const [rows] = (await h.db.pool.query(
      'SELECT institute_id, kind, sent FROM wa_usage',
    )) as unknown as [{ institute_id: string; kind: string; sent: number }[]];
    expect(rows).toEqual([{ institute_id: A.instituteId, kind: 'login_code', sent: 1 }]);
  });
});
