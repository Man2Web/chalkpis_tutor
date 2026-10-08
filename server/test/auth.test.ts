import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { MockProvider } from '../src/messaging/provider.js';
import { REUSE_GRACE_SECONDS } from '../src/auth/sessions.js';
import { signToken } from '../src/lib/jwt.js';
import { runMigrations } from '../src/migrate.js';
import path from 'node:path';
import { createTestDb, testConfig, type TestDb } from './db.js';
import type { FastifyInstance } from 'fastify';

let db: TestDb;
let app: FastifyInstance;
let provider: MockProvider;
let now: Date;
const minute = 60_000;
const config = () => testConfig({ ...db.config, WA_TEMPLATE_OTP: '1809804' });
const PHONE = '98765 43210';
const E164 = '+919876543210';

beforeAll(async () => {
  db = await createTestDb();
  await runMigrations(
    db.pool,
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'migrations'),
  );
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.pool.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of [
    'refresh_tokens',
    'otp_codes',
    'subscriptions',
    'memberships',
    'institutes',
    'users',
  ])
    await db.pool.query(`TRUNCATE ${t}`);
  await db.pool.query('SET FOREIGN_KEY_CHECKS=1');
  now = new Date('2026-10-08T06:00:00Z');
  provider = new MockProvider();
  app = await buildApp({ config: config(), pool: db.pool, provider, clock: () => now });
});

const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url, payload: payload as object, headers });
const lastCode = () => provider.sent[provider.sent.length - 1]!.vars[0]!;
const advance = (ms: number) => (now = new Date(now.getTime() + ms));

async function login(phone = PHONE) {
  const r = await post('/auth/otp/request', { phone });
  expect(r.statusCode).toBe(200);
  const v = await post('/auth/otp/verify', { phone, code: lastCode() });
  expect(v.statusCode).toBe(200);
  return v.json() as {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: string; phone: string };
    membership: null | { instituteId: string; role: string };
  };
}
const authed = (token: string) => ({ authorization: `Bearer ${token}` });

describe('requesting a login code', () => {
  it('sends a 6-digit code through the configured template and stores only a hash', async () => {
    const r = await post('/auth/otp/request', { phone: PHONE });
    expect([r.statusCode, r.json()]).toEqual([200, { ok: true, resendInSeconds: 60 }]);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]).toMatchObject({ to: E164, templateId: '1809804' });
    expect(lastCode()).toMatch(/^\d{6}$/);
    const [rows] = (await db.pool.query('SELECT code_hash FROM otp_codes')) as unknown as [
      { code_hash: string }[],
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(lastCode());
  });

  it('rejects numbers that are not Indian mobiles, and bad bodies', async () => {
    for (const phone of ['12345', '+1 415 555 0100', ''])
      expect((await post('/auth/otp/request', { phone })).statusCode).toBe(400);
    expect((await post('/auth/otp/request', {})).json()).toEqual({ error: 'bad_request' });
    expect(provider.sent).toHaveLength(0);
  });

  it('answers the same for a known and an unknown number (no account probing)', async () => {
    await login(PHONE);
    advance(2 * minute);
    const known = await post('/auth/otp/request', { phone: PHONE });
    const unknown = await post('/auth/otp/request', { phone: '9123456789' });
    expect([known.statusCode, known.json()]).toEqual([unknown.statusCode, unknown.json()]);
  });

  it('allows one code a minute, with a Retry-After hint', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    advance(20_000);
    const again = await post('/auth/otp/request', { phone: PHONE });
    expect(again.statusCode).toBe(429);
    expect(again.json()).toEqual({ error: 'too_soon', retryAfter: 40 });
    expect(again.headers['retry-after']).toBe('40');
    advance(41_000);
    expect((await post('/auth/otp/request', { phone: PHONE })).statusCode).toBe(200);
  });

  it('allows five codes an hour per number, then asks to wait', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post('/auth/otp/request', { phone: PHONE })).statusCode).toBe(200);
      advance(61_000);
    }
    const sixth = await post('/auth/otp/request', { phone: PHONE });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error).toBe('too_many');
    advance(3600_000);
    expect((await post('/auth/otp/request', { phone: PHONE })).statusCode).toBe(200);
  });

  it('limits are per number: another number is not affected', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    expect((await post('/auth/otp/request', { phone: '9123456789' })).statusCode).toBe(200);
  });

  it('if WhatsApp fails: 503, and the unsent code does not count against the limits', async () => {
    provider.failNext = true;
    const r = await post('/auth/otp/request', { phone: PHONE });
    expect([r.statusCode, r.json()]).toEqual([503, { error: 'otp_unavailable' }]);
    expect(
      (
        (await db.pool.query('SELECT COUNT(*) AS n FROM otp_codes')) as unknown as [{ n: number }[]]
      )[0][0]!.n,
    ).toBe(0);
    expect((await post('/auth/otp/request', { phone: PHONE })).statusCode).toBe(200);
  });

  it('with no WhatsApp configured at all: 503', async () => {
    const bare = await buildApp({ config: config(), pool: db.pool, provider: null });
    expect(
      (await bare.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone: PHONE } }))
        .statusCode,
    ).toBe(503);
  });

  it('a new code cancels the previous one', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const first = lastCode();
    advance(61_000);
    await post('/auth/otp/request', { phone: PHONE });
    expect((await post('/auth/otp/verify', { phone: PHONE, code: first })).statusCode).toBe(401);
    expect((await post('/auth/otp/verify', { phone: PHONE, code: lastCode() })).statusCode).toBe(
      200,
    );
  });

  it('shows the code in the response only when dev echo is on, and never in production', async () => {
    const dev = await buildApp({
      config: { ...config(), OTP_DEV_ECHO: true },
      pool: db.pool,
      provider: new MockProvider(),
      clock: () => now,
    });
    const r = await dev.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: PHONE },
    });
    expect(r.json().devCode).toMatch(/^\d{6}$/);
    const prod = await buildApp({
      config: { ...config(), OTP_DEV_ECHO: true, NODE_ENV: 'production' },
      pool: db.pool,
      provider: new MockProvider(),
      clock: () => now,
    });
    advance(2 * minute);
    expect(
      (
        await prod.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone: PHONE } })
      ).json(),
    ).not.toHaveProperty('devCode');
  });
});

describe('checking a login code', () => {
  it('a correct code signs in, creates the account on first use, and gives the profile', async () => {
    const s = await login();
    expect(s.user.phone).toBe(E164);
    expect(s.membership).toBeNull();
    expect(s.expiresIn).toBe(900);
    expect(s.refreshToken.length).toBeGreaterThan(30);
  });

  it('signing in again as the same number gives the same account', async () => {
    const a = await login();
    advance(2 * minute);
    const b = await login();
    expect(b.user.id).toBe(a.user.id);
    expect(
      (
        (await db.pool.query('SELECT COUNT(*) AS n FROM users')) as unknown as [{ n: number }[]]
      )[0][0]!.n,
    ).toBe(1);
  });

  it('a code works once', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const code = lastCode();
    expect((await post('/auth/otp/verify', { phone: PHONE, code })).statusCode).toBe(200);
    expect((await post('/auth/otp/verify', { phone: PHONE, code })).statusCode).toBe(401);
  });

  it('a wrong code and every other failure give the same answer', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const wrong = lastCode() === '000000' ? '111111' : '000000';
    const a = await post('/auth/otp/verify', { phone: PHONE, code: wrong });
    const b = await post('/auth/otp/verify', { phone: '9123456789', code: wrong }); // no code was ever sent to this number
    expect([a.statusCode, a.body]).toEqual([401, '{"error":"invalid_code"}']);
    expect([b.statusCode, b.body]).toEqual([401, '{"error":"invalid_code"}']);
  });

  it('five wrong tries lock the code, even for the correct one', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      expect((await post('/auth/otp/verify', { phone: PHONE, code: wrong })).statusCode).toBe(401);
    expect((await post('/auth/otp/verify', { phone: PHONE, code: right })).statusCode).toBe(401);
    advance(61_000); // a fresh code is the way forward
    await post('/auth/otp/request', { phone: PHONE });
    expect((await post('/auth/otp/verify', { phone: PHONE, code: lastCode() })).statusCode).toBe(
      200,
    );
  });

  it('parallel guesses cannot beat the attempt limit', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const right = lastCode();
    const wrongs = Array.from({ length: 12 }, (_, i) => String(100000 + i)).filter(
      (c) => c !== right,
    );
    await Promise.all(wrongs.map((code) => post('/auth/otp/verify', { phone: PHONE, code })));
    const [rows] = (await db.pool.query('SELECT attempts FROM otp_codes')) as unknown as [
      { attempts: number }[],
    ];
    expect(rows[0]!.attempts).toBe(5);
    expect((await post('/auth/otp/verify', { phone: PHONE, code: right })).statusCode).toBe(401);
  });

  it('expires after 5 minutes', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const code = lastCode();
    advance(5 * minute + 1000);
    expect((await post('/auth/otp/verify', { phone: PHONE, code })).statusCode).toBe(401);
  });

  it('a code for one number is useless for another', async () => {
    await post('/auth/otp/request', { phone: PHONE });
    const code = lastCode();
    await post('/auth/otp/request', { phone: '9123456789' });
    expect((await post('/auth/otp/verify', { phone: '9123456789', code })).statusCode).toBe(
      code === lastCode() ? 200 : 401,
    );
  });

  it('malformed input is refused', async () => {
    for (const body of [
      { phone: PHONE, code: '12345' },
      { phone: PHONE, code: 'abcdef' },
      { phone: PHONE, code: '1234567' },
      { phone: PHONE },
      {},
    ]) {
      expect([400, 401]).toContain((await post('/auth/otp/verify', body)).statusCode);
    }
  });
});

describe('sessions', () => {
  it('access tokens work, then expire', async () => {
    const s = await login();
    expect((await app.inject({ url: '/me', headers: authed(s.accessToken) })).statusCode).toBe(200);
    advance(16 * minute);
    expect((await app.inject({ url: '/me', headers: authed(s.accessToken) })).statusCode).toBe(401);
  });

  it('refreshing swaps in a new pair and the old refresh token stops working', async () => {
    const s = await login();
    advance(minute);
    const r = await post('/auth/refresh', { refreshToken: s.refreshToken });
    expect(r.statusCode).toBe(200);
    const next = r.json() as { accessToken: string; refreshToken: string };
    expect(next.refreshToken).not.toBe(s.refreshToken);
    expect((await app.inject({ url: '/me', headers: authed(next.accessToken) })).statusCode).toBe(
      200,
    );
    expect((await post('/auth/refresh', { refreshToken: s.refreshToken })).statusCode).toBe(401);
  });

  it('a stolen, already-used refresh token ends the whole login', async () => {
    const s = await login();
    advance(minute);
    const legit = (await post('/auth/refresh', { refreshToken: s.refreshToken })).json() as {
      refreshToken: string;
    };
    advance((REUSE_GRACE_SECONDS + 5) * 1000);
    expect((await post('/auth/refresh', { refreshToken: s.refreshToken })).statusCode).toBe(401); // the thief tries the old one
    expect((await post('/auth/refresh', { refreshToken: legit.refreshToken })).statusCode).toBe(
      401,
    ); // and now the real user must log in again
  });

  it('a quick retry with the old token (lost response) fails but does not log the user out', async () => {
    const s = await login();
    advance(minute);
    const fresh = (await post('/auth/refresh', { refreshToken: s.refreshToken })).json() as {
      refreshToken: string;
    };
    advance(3000);
    expect((await post('/auth/refresh', { refreshToken: s.refreshToken })).statusCode).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: fresh.refreshToken })).statusCode).toBe(
      200,
    );
  });

  it('refresh tokens expire after 60 days', async () => {
    const s = await login();
    advance(61 * 86_400_000);
    expect((await post('/auth/refresh', { refreshToken: s.refreshToken })).statusCode).toBe(401);
  });

  it('logout ends that login only, and junk is ignored', async () => {
    const a = await login();
    advance(2 * minute);
    const b = await login(); // a second device
    expect((await post('/auth/logout', { refreshToken: a.refreshToken })).statusCode).toBe(204);
    expect((await post('/auth/refresh', { refreshToken: a.refreshToken })).statusCode).toBe(401);
    expect((await post('/auth/refresh', { refreshToken: b.refreshToken })).statusCode).toBe(200);
    expect((await post('/auth/logout', { refreshToken: 'junk' })).statusCode).toBe(204);
    expect((await post('/auth/logout', {})).statusCode).toBe(204);
  });

  it('refresh tokens are stored hashed', async () => {
    const s = await login();
    const [rows] = (await db.pool.query('SELECT token_hash FROM refresh_tokens')) as unknown as [
      { token_hash: string }[],
    ];
    expect(JSON.stringify(rows)).not.toContain(s.refreshToken);
  });
});

describe('who is calling', () => {
  it('refuses a missing, malformed, forged or other-secret token', async () => {
    const s = await login();
    const bad = [
      undefined,
      'Bearer',
      'Bearer abc.def.ghi',
      'Basic xyz',
      `Bearer ${signToken(s.user.id, 'some-other-secret-some-other-secret-1', 900, now.getTime())}`,
    ];
    for (const h of bad)
      expect(
        (await app.inject({ url: '/me', headers: h ? { authorization: h } : {} })).statusCode,
      ).toBe(401);
    expect((await app.inject({ url: '/me' })).json()).toEqual({ error: 'unauthorized' });
  });

  it('a valid token for a user that no longer exists is refused', async () => {
    const s = await login();
    await db.pool.query('DELETE FROM users WHERE id = ?', [s.user.id]);
    expect((await app.inject({ url: '/me', headers: authed(s.accessToken) })).statusCode).toBe(401);
  });
});

describe('institutes and tenant isolation', () => {
  const create = (
    token: string,
    body: object = { tutorName: 'Asha Rao', instituteName: 'Bright Tuition', language: 'en' },
  ) => post('/institutes', body, authed(token));

  it('first-time setup makes the owner, the institute and a 7-day trial, and is safe to repeat', async () => {
    const s = await login();
    const r = await create(s.accessToken);
    expect(r.statusCode).toBe(201);
    const { instituteId } = r.json() as { instituteId: string };
    const sub = (await app.inject({ url: '/subscription', headers: authed(s.accessToken) })).json();
    expect(sub).toMatchObject({
      plan: 'trial',
      status: 'active',
      active: true,
      studentLimit: null,
      batchLimit: null,
    });
    expect(new Date(sub.expiresAt).getTime() - now.getTime()).toBe(7 * 86_400_000);
    const me = (await app.inject({ url: '/me', headers: authed(s.accessToken) })).json();
    expect(me).toMatchObject({
      user: { name: 'Asha Rao' },
      membership: { instituteId, role: 'owner', onboardingDone: false },
    });

    const again = await create(s.accessToken, {
      tutorName: 'Someone Else',
      instituteName: 'Other Name',
    });
    expect([again.statusCode, again.json()]).toEqual([200, { instituteId, created: false }]);
    expect(
      (await app.inject({ url: '/institute', headers: authed(s.accessToken) })).json().name,
    ).toBe('Bright Tuition');
  });

  it('refuses bad setup input', async () => {
    const s = await login();
    for (const b of [
      {},
      { tutorName: 'A', instituteName: 'Valid Name' },
      { tutorName: 'Valid', instituteName: 'x'.repeat(200) },
      { tutorName: 'Valid', instituteName: 'Valid Name', language: 'fr' },
    ]) {
      expect((await create(s.accessToken, b)).statusCode).toBe(400);
    }
  });

  it('each owner sees only their own institute', async () => {
    const a = await login('98765 43210');
    advance(2 * minute);
    const b = await login('91234 56789');
    await create(a.accessToken, { tutorName: 'Asha', instituteName: 'Alpha Classes' });
    await create(b.accessToken, { tutorName: 'Bala', instituteName: 'Beta Classes' });
    expect(
      (await app.inject({ url: '/institute', headers: authed(a.accessToken) })).json().name,
    ).toBe('Alpha Classes');
    expect(
      (await app.inject({ url: '/institute', headers: authed(b.accessToken) })).json().name,
    ).toBe('Beta Classes');
    expect(
      (await app.inject({ url: '/subscription', headers: authed(b.accessToken) })).statusCode,
    ).toBe(200);
  });

  it('cannot reach another institute by putting its id anywhere', async () => {
    const a = await login('98765 43210');
    advance(2 * minute);
    const b = await login('91234 56789');
    const { instituteId: aId } = (
      await create(a.accessToken, { tutorName: 'Asha', instituteName: 'Alpha Classes' })
    ).json() as { instituteId: string };
    await create(b.accessToken, { tutorName: 'Bala', instituteName: 'Beta Classes' });
    const r = await app.inject({
      method: 'PATCH',
      url: `/institute?id=${aId}&instituteId=${aId}`,
      headers: authed(b.accessToken),
      payload: { name: 'Hijacked', instituteId: aId } as object,
    });
    expect(r.statusCode).toBe(200); // it edits B's own institute; the id in the request is ignored
    const [rows] = (await db.pool.query(
      'SELECT id, name FROM institutes ORDER BY name',
    )) as unknown as [{ id: string; name: string }[]];
    expect(rows.map((x) => x.name)).toEqual(['Alpha Classes', 'Hijacked']);
    expect(rows.find((x) => x.name === 'Alpha Classes')!.id).toBe(aId);
  });

  it('a user with no institute is told so, not shown anything', async () => {
    const s = await login();
    for (const url of ['/institute', '/subscription'])
      expect((await app.inject({ url, headers: authed(s.accessToken) })).json()).toEqual({
        error: 'no_institute',
      });
  });

  it('staff can read the institute but not change it', async () => {
    const owner = await login('98765 43210');
    advance(2 * minute);
    const staff = await login('91234 56789');
    const { instituteId } = (await create(owner.accessToken)).json() as { instituteId: string };
    await db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.user.id, instituteId],
    );
    expect(
      (await app.inject({ url: '/institute', headers: authed(staff.accessToken) })).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: '/institute',
          headers: authed(staff.accessToken),
          payload: { name: 'Nope' } as object,
        })
      ).json(),
    ).toEqual({ error: 'forbidden' });
  });

  it('losing membership takes effect at once, even with a valid token', async () => {
    const s = await login();
    await create(s.accessToken);
    await db.pool.query('DELETE FROM memberships WHERE user_id = ?', [s.user.id]);
    expect(
      (await app.inject({ url: '/institute', headers: authed(s.accessToken) })).statusCode,
    ).toBe(403);
  });

  it('editing validates input and is refused once the plan has expired (read-only)', async () => {
    const s = await login();
    await create(s.accessToken);
    let token = s.accessToken;
    const patch = (payload: object) =>
      app.inject({ method: 'PATCH', url: '/institute', headers: authed(token), payload });
    expect((await patch({ receiptPrefix: 'rc' })).statusCode).toBe(200);
    expect(
      (await app.inject({ url: '/institute', headers: authed(s.accessToken) })).json()
        .receiptPrefix,
    ).toBe('RC');
    for (const bad of [{ receiptPrefix: 'T-D' }, { receiptPrefix: 'A' }, { name: 'x' }, {}])
      expect((await patch(bad)).statusCode).toBe(400);
    advance(8 * 86_400_000); // the 7-day trial is over
    token = (
      (await post('/auth/refresh', { refreshToken: s.refreshToken })).json() as {
        accessToken: string;
      }
    ).accessToken; // the 15-minute access token lapsed too
    expect((await patch({ name: 'Too Late Name' })).json()).toEqual({ error: 'plan_expired' });
    expect((await app.inject({ url: '/institute', headers: authed(token) })).statusCode).toBe(200); // still readable
  });

  it('finishing onboarding is remembered', async () => {
    const s = await login();
    await create(s.accessToken);
    await app.inject({
      method: 'POST',
      url: '/me/onboarding-complete',
      headers: authed(s.accessToken),
    });
    expect(
      (await app.inject({ url: '/me', headers: authed(s.accessToken) })).json().membership
        .onboardingDone,
    ).toBe(true);
  });
});
