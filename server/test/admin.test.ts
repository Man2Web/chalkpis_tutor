import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const ADMIN = '+919000000001';
let h: Harness;
let admin: Tenant;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness({ ADMIN_PHONES: [ADMIN], OTP_DEV_ECHO: true });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  admin = await h.tenant(ADMIN, { institute: 'Chalkpis HQ' });
  A = await h.tenant('+919876543210', { tutor: 'Asha', institute: 'Alpha' });
  B = await h.tenant('+919123456789', { tutor: 'Bala', institute: 'Beta' });
});

/** Signs in through the real WhatsApp-code flow (test mode returns the code). */
async function signIn(phone: string) {
  h.clock.now = new Date(h.clock.now.getTime() + 61_000); // one code a minute per number
  const code = (
    await h.app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } })
  ).json().devCode as string;
  return h.app.inject({ method: 'POST', url: '/auth/otp/verify', payload: { phone, code } });
}

describe('admin access', () => {
  it('only numbers in ADMIN_PHONES can use the admin API; the profile says who is admin', async () => {
    expect((await admin.call('GET', '/admin/api/overview')).status).toBe(200);
    for (const url of [
      '/admin/api/overview',
      '/admin/api/users',
      '/admin/api/logins',
      '/admin/api/audit',
    ])
      expect((await A.call('GET', url)).status, url).toBe(403);
    expect((await h.app.inject({ url: '/admin/api/users' })).statusCode).toBe(401);
    expect((await admin.call('GET', '/me')).body.isAdmin).toBe(true);
    expect((await A.call('GET', '/me')).body.isAdmin).toBe(false);
  });

  it('the dashboard page is served with a strict content policy', async () => {
    const r = await h.app.inject({ url: '/admin' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-security-policy']).toContain("script-src 'self'");
    expect(r.headers['x-robots-tag']).toContain('noindex');
    expect((await h.app.inject({ url: '/admin.js' })).statusCode).toBe(200);
  });
});

describe('managing logins', () => {
  it('lists every login with institute, plan and last login, and searches', async () => {
    await signIn('+919876543210');
    const all = (await admin.call('GET', '/admin/api/users')).body.users;
    expect(all).toHaveLength(3);
    const asha = all.find((u: { phone: string }) => u.phone === '+919876543210');
    expect(asha).toMatchObject({ name: 'Asha', role: 'owner', blocked: false, activeSessions: 1 });
    expect(asha.institute).toMatchObject({ name: 'Alpha', plan: 'trial', active: true });
    expect(asha.lastLoginAt).not.toBeNull();
    const found = (await admin.call('GET', '/admin/api/users?q=Beta')).body.users;
    expect(found.map((u: { name: string }) => u.name)).toEqual(['Bala']);
    const ov = (await admin.call('GET', '/admin/api/overview')).body;
    expect(ov).toMatchObject({
      users: 3,
      owners: 3,
      institutes: 3,
      trials: 3,
      logins24h: 1,
      signedIn: 1,
    });
  });

  it('blocking signs the login out everywhere, refuses old tokens at once and refuses new sign-ins', async () => {
    const before = (await signIn('+919876543210')).json();
    expect((await A.call('GET', '/students')).status).toBe(200);
    const r = await admin.call('POST', `/admin/api/users/${A.userId}/block`, {
      reason: 'fake account',
    });
    expect(r.status).toBe(200);
    expect((await A.call('GET', '/students')).status).toBe(403); // access token still unexpired, refused
    const refresh = await h.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: before.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    expect((await signIn('+919876543210')).json().error).toBe('account_blocked');
    expect((await admin.call('GET', '/admin/api/users?filter=blocked')).body.users).toHaveLength(1);

    await admin.call('POST', `/admin/api/users/${A.userId}/unblock`);
    expect((await signIn('+919876543210')).statusCode).toBe(200);
    expect((await A.call('GET', '/students')).status).toBe(200);
  });

  it('sign out everywhere ends every session but the person can sign in again', async () => {
    const s1 = (await signIn('+919123456789')).json();
    await signIn('+919123456789');
    expect((await admin.call('GET', `/admin/api/users/${B.userId}`)).body.user.activeSessions).toBe(
      2,
    );
    expect((await admin.call('POST', `/admin/api/users/${B.userId}/sign-out`)).body.ended).toBe(2);
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: { refreshToken: s1.refreshToken },
        })
      ).statusCode,
    ).toBe(401);
    expect((await signIn('+919123456789')).statusCode).toBe(200);
  });

  it('admins cannot block or sign out themselves or another admin', async () => {
    expect(
      (await admin.call('POST', `/admin/api/users/${admin.userId}/block`, {})).body.error,
    ).toBe('cannot_change_admin');
  });

  it('extends a plan from its current end, and every action is in the audit log', async () => {
    const r = await admin.call('POST', `/admin/api/institutes/${A.instituteId}/plan`, {
      plan: 'pro',
      days: 30,
    });
    expect(r.status).toBe(200);
    expect(r.body.plan).toBe('pro');
    // trial of 7 days from the harness clock + 30 days
    expect(r.body.expiresAt.slice(0, 10)).toBe('2026-11-14');
    expect((await A.call('GET', '/subscription')).body).toMatchObject({
      plan: 'pro',
      active: true,
    });
    expect(
      (
        await admin.call('POST', `/admin/api/institutes/${A.instituteId}/plan`, {
          plan: 'gold',
          days: 3,
        })
      ).status,
    ).toBe(400);
    await admin.call('POST', `/admin/api/users/${B.userId}/sign-out`);
    const audit = (await admin.call('GET', '/admin/api/audit')).body.audit;
    expect(audit.map((a: { action: string }) => a.action)).toEqual(['sign-out', 'set-plan']);
    expect(audit[0]).toMatchObject({ admin: ADMIN, target: '+919123456789' });
  });

  it('shows recent login-code requests and their result', async () => {
    await signIn('+919876543210');
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    await h.app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+919111111111' },
    });
    const logins = (await admin.call('GET', '/admin/api/logins')).body.logins;
    expect(logins.map((l: { phone: string; result: string }) => [l.phone, l.result])).toEqual([
      ['+919111111111', 'waiting'],
      ['+919876543210', 'signed in'],
    ]);
  });
});
