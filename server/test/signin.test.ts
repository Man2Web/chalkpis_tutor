import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './helpers.js';

describe('sign in with WhatsApp only', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ PUBLIC_BASE_URL: 'https://tutor.chalkpis.com' });
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    h.provider.sent = [];
  });

  const post = (url: string, payload: unknown, headers: Record<string, string> = {}) =>
    h.app.inject({ method: 'POST', url, payload: payload as object, headers });
  const lastWhatsAppCode = () => h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;

  /** WhatsApp code for a number, from the app on the given phone. */
  async function phoneSignIn(phone: string, headers: Record<string, string> = {}) {
    h.clock.now = new Date(h.clock.now.getTime() + 61_000); // past the one-minute cooldown
    expect((await post('/auth/otp/request', { phone })).statusCode).toBe(200);
    return post('/auth/otp/verify', { phone, code: lastWhatsAppCode() }, headers);
  }

  it('records each sign-in as WhatsApp, and from which phone', async () => {
    await phoneSignIn('9822222222');
    await phoneSignIn('9822222222', { 'x-client-platform': 'iOS' });
    // the app says which phone it is; anything else is ignored
    await phoneSignIn('9822222222', { 'x-client-platform': 'toaster' });
    const [rows] = (await h.db.pool.query(
      'SELECT method, platform FROM login_events ORDER BY id',
    )) as unknown as [{ method: string; platform: string | null }[]];
    expect(rows).toEqual([
      { method: 'whatsapp', platform: null },
      { method: 'whatsapp', platform: 'ios' },
      { method: 'whatsapp', platform: null },
    ]);
  });

  it('tells older app builds that WhatsApp is the only way in', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/auth/methods' });
    expect(r.json()).toEqual({
      whatsapp: true,
      email: false,
      google: false,
      apple: false,
      appleNative: false,
    });
  });

  it('email, Google and Apple sign-in are gone', async () => {
    for (const [method, url] of [
      ['POST', '/auth/email/request'],
      ['POST', '/auth/email/verify'],
      ['POST', '/auth/oauth/google/begin'],
      ['GET', '/auth/oauth/google/callback'],
      ['POST', '/auth/oauth/apple/callback'],
      ['POST', '/auth/apple/nonce'],
      ['POST', '/auth/apple/native'],
      ['POST', '/auth/ticket'],
    ] as const)
      expect(
        (await h.app.inject({ method, url, ...(method === 'POST' ? { payload: {} } : {}) }))
          .statusCode,
        url,
      ).toBe(404);
  });

  it('the profile lists no other sign-in methods, and a leftover sign-up token is ignored', async () => {
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    await post('/auth/otp/request', { phone: '9811111111' });
    // an older app build may still send one; the WhatsApp code alone decides
    const r = await post('/auth/otp/verify', {
      phone: '9811111111',
      code: lastWhatsAppCode(),
      signupToken: 'x'.repeat(43),
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().user).toEqual({
      id: expect.any(String),
      phone: '+919811111111',
      name: '',
      language: 'en',
    });
    expect(r.json().signInMethods).toBeUndefined();
  });
});
