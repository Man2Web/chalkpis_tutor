import {
  createLocalJWKSet,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  SignJWT,
  decodeJwt,
} from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Identity } from '../src/auth/identity.js';
import { MockMailer } from '../src/auth/mailer.js';
import { AppleProvider, GoogleProvider, type OAuthProvider } from '../src/auth/oauth.js';
import { startHarness, type Harness } from './helpers.js';

/** Stands in for Google/Apple: the "code" names which identity comes back. */
class FakeProvider implements OAuthProvider {
  constructor(public name: 'google' | 'apple') {}
  identities = new Map<string, Identity>();
  lastNonce = '';
  authorizeUrl({
    state,
    nonce,
    redirectUri,
  }: {
    state: string;
    nonce: string;
    redirectUri: string;
  }) {
    this.lastNonce = nonce;
    return `https://provider.test/auth?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
  async exchange({ code }: { code: string }) {
    const id = this.identities.get(code);
    if (!id) throw new Error('bad code');
    return id;
  }
}

describe('sign in with WhatsApp, email, Google and Apple', () => {
  const mailer = new MockMailer();
  const google = new FakeProvider('google');
  const apple = new FakeProvider('apple');
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness(
      { PUBLIC_BASE_URL: 'https://tutor.chalkpis.com' },
      { mailer, oauth: { google, apple } },
    );
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    mailer.sent = [];
    h.provider.sent = [];
  });

  const post = (url: string, payload: unknown) =>
    h.app.inject({ method: 'POST', url, payload: payload as object });
  const lastWhatsAppCode = () => h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
  const lastEmailCode = () => mailer.sent[mailer.sent.length - 1]!.text.match(/\d{6}/)![0];

  /** WhatsApp code for a number, optionally finishing a pending sign-up. */
  async function phoneSignIn(phone: string, signupToken?: string) {
    h.clock.now = new Date(h.clock.now.getTime() + 61_000); // past the one-minute cooldown
    expect((await post('/auth/otp/request', { phone })).statusCode).toBe(200);
    return post('/auth/otp/verify', { phone, code: lastWhatsAppCode(), signupToken });
  }
  async function emailSignIn(email: string) {
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    expect((await post('/auth/email/request', { email })).statusCode).toBe(200);
    return post('/auth/email/verify', { email, code: lastEmailCode() });
  }
  /** The whole Google/Apple round trip as the app does it: start -> provider -> callback -> ticket. */
  async function oauthSignIn(p: 'google' | 'apple', code: string) {
    const start = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/${p}/start?redirect=${encodeURIComponent('chalkpis://auth')}`,
    });
    expect(start.statusCode).toBe(302);
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb =
      p === 'google'
        ? await h.app.inject({
            method: 'GET',
            url: `/auth/oauth/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
          })
        : await h.app.inject({
            method: 'POST',
            url: '/auth/oauth/apple/callback',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            payload: new URLSearchParams({ code, state }).toString(),
          });
    expect(cb.statusCode).toBe(302);
    const back = new URL(cb.headers.location as string);
    expect(back.protocol).toBe('chalkpis:');
    const ticket = back.searchParams.get('ticket');
    expect(ticket).toBeTruthy();
    return post('/auth/ticket', { ticket });
  }

  it('lists the methods that are switched on', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/auth/methods' });
    expect(r.json()).toEqual({ whatsapp: true, email: true, google: true, apple: true });
  });

  it('email sign-up: the code, then the mobile number once, then email alone signs in', async () => {
    const first = await emailSignIn('Asha@Example.com');
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ needsPhone: true, email: 'asha@example.com' });
    expect(mailer.sent[0]!.subject).toMatch(/\d{6} is your Chalkpis sign-in code/);

    const done = await phoneSignIn('9811111111', first.json().signupToken);
    expect(done.statusCode).toBe(200);
    expect(done.json().user).toMatchObject({ phone: '+919811111111', email: 'asha@example.com' });
    expect(done.json().signInMethods.map((m: { provider: string }) => m.provider)).toEqual([
      'email',
    ]);

    const again = await emailSignIn('asha@example.com');
    expect(again.json().accessToken).toBeTruthy();
    expect(again.json().user.id).toBe(done.json().user.id);
  });

  it('Google for someone who already uses WhatsApp sign-in links to that account, not a new one', async () => {
    const existing = (await phoneSignIn('9822222222')).json();
    google.identities.set('g1', {
      provider: 'google',
      subject: 'g-sub-1',
      email: 'ravi@gmail.com',
      emailVerified: true,
      name: 'Ravi Kumar',
    });
    const first = await oauthSignIn('google', 'g1');
    expect(first.json().needsPhone).toBe(true);
    const linked = await phoneSignIn('9822222222', first.json().signupToken);
    expect(linked.json().user.id).toBe(existing.user.id);
    expect(linked.json().user).toMatchObject({ email: 'ravi@gmail.com', name: 'Ravi Kumar' });
    // next time Google alone is enough
    const again = await oauthSignIn('google', 'g1');
    expect(again.json().user.id).toBe(existing.user.id);
  });

  it('Apple with the same verified email as an existing account signs straight in', async () => {
    const em = await emailSignIn('meena@example.com');
    const user = (await phoneSignIn('9833333333', em.json().signupToken)).json().user;
    apple.identities.set('a1', {
      provider: 'apple',
      subject: 'apple-sub',
      email: 'meena@example.com',
      emailVerified: true,
    });
    const r = await oauthSignIn('apple', 'a1');
    expect(r.json().accessToken).toBeTruthy();
    expect(r.json().user.id).toBe(user.id);
  });

  it("an unverified email never opens someone else's account", async () => {
    const em = await emailSignIn('owner@example.com');
    await phoneSignIn('9844444444', em.json().signupToken);
    apple.identities.set('a2', {
      provider: 'apple',
      subject: 'other',
      email: 'owner@example.com',
      emailVerified: false,
    });
    expect((await oauthSignIn('apple', 'a2')).json().needsPhone).toBe(true);
  });

  it('tickets and sign-up tokens work once', async () => {
    google.identities.set('g2', {
      provider: 'google',
      subject: 'g2',
      email: null,
      emailVerified: false,
    });
    const start = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/start?redirect=${encodeURIComponent('chalkpis://auth')}`,
    });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cb = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=g2&state=${encodeURIComponent(state)}`,
    });
    const ticket = new URL(cb.headers.location as string).searchParams.get('ticket');
    const first = await post('/auth/ticket', { ticket });
    expect(first.statusCode).toBe(200);
    expect((await post('/auth/ticket', { ticket })).statusCode).toBe(401);

    const token = first.json().signupToken;
    await phoneSignIn('9855555555', token);
    // the same sign-up token cannot link a second number
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    await post('/auth/otp/request', { phone: '9866666666' });
    const reuse = await post('/auth/otp/verify', {
      phone: '9866666666',
      code: lastWhatsAppCode(),
      signupToken: token,
    });
    expect(reuse.statusCode).toBe(410);
  });

  it('refuses unknown redirects and forged or expired states', async () => {
    const bad = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/start?redirect=${encodeURIComponent('https://evil.example/steal')}`,
    });
    expect(bad.statusCode).toBe(400);
    const forged = await h.app.inject({
      method: 'GET',
      url: '/auth/oauth/google/callback?code=g1&state=not-a-real-state',
    });
    expect(forged.statusCode).toBe(400);
    const start = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/start?redirect=${encodeURIComponent('chalkpis://auth')}`,
    });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    h.clock.now = new Date(h.clock.now.getTime() + 11 * 60_000); // state lasts ten minutes
    const late = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=g1&state=${encodeURIComponent(state)}`,
    });
    expect(late.statusCode).toBe(400);
  });

  it('a cancelled or failed provider sign-in goes back to the app with an error, not a ticket', async () => {
    const start = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/start?redirect=${encodeURIComponent('chalkpis://auth')}`,
    });
    const state = new URL(start.headers.location as string).searchParams.get('state')!;
    const cancelled = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?error=access_denied&state=${encodeURIComponent(state)}`,
    });
    expect(new URL(cancelled.headers.location as string).searchParams.get('error')).toBe(
      'cancelled',
    );
    const failed = await h.app.inject({
      method: 'GET',
      url: `/auth/oauth/google/callback?code=unknown&state=${encodeURIComponent(state)}`,
    });
    expect(new URL(failed.headers.location as string).searchParams.get('error')).toBe('failed');
  });

  it('email codes: bad address, wrong code locks after five tries, a blocked account is refused', async () => {
    expect((await post('/auth/email/request', { email: 'not-an-email' })).statusCode).toBe(400);
    await post('/auth/email/request', { email: 'x@example.com' });
    for (let i = 0; i < 5; i++)
      expect(
        (await post('/auth/email/verify', { email: 'x@example.com', code: '000000' })).statusCode,
      ).toBe(401);
    expect(
      (await post('/auth/email/verify', { email: 'x@example.com', code: lastEmailCode() }))
        .statusCode,
    ).toBe(401);

    const em = await emailSignIn('blocked@example.com');
    const u = (await phoneSignIn('9877777777', em.json().signupToken)).json().user;
    await h.db.pool.query('UPDATE users SET blocked_at = ? WHERE id = ?', [h.clock.now, u.id]);
    expect((await emailSignIn('blocked@example.com')).statusCode).toBe(403);
  });
});

describe('the real Google and Apple providers check every token', () => {
  it('Google: accepts its own signed token, refuses a wrong nonce or audience', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }],
    });
    const token = (aud: string, nonce: string) =>
      new SignJWT({ email: 'ravi@gmail.com', email_verified: true, name: 'Ravi', nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer('https://accounts.google.com')
        .setAudience(aud)
        .setSubject('g-123')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    let idToken = await token('client-1', 'n1');
    const fetchFn = (async () =>
      new Response(JSON.stringify({ id_token: idToken }))) as unknown as typeof fetch;
    const g = new GoogleProvider('client-1', 'secret', fetchFn, jwks);
    expect(await g.exchange({ code: 'c', nonce: 'n1', redirectUri: 'https://x/cb' })).toMatchObject(
      {
        provider: 'google',
        subject: 'g-123',
        email: 'ravi@gmail.com',
        emailVerified: true,
      },
    );
    await expect(
      g.exchange({ code: 'c', nonce: 'other', redirectUri: 'https://x/cb' }),
    ).rejects.toThrow();
    idToken = await token('someone-else', 'n1');
    await expect(
      g.exchange({ code: 'c', nonce: 'n1', redirectUri: 'https://x/cb' }),
    ).rejects.toThrow();
  });

  it('Apple: signs its client secret with the .p8 key and reads the first-time name', async () => {
    const apple = await generateKeyPair('ES256', { extractable: true });
    const p8 = await exportPKCS8(apple.privateKey);
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({
      keys: [{ ...(await exportJWK(publicKey)), kid: 'a1', alg: 'RS256' }],
    });
    const idToken = await new SignJWT({
      email: 'x@privaterelay.appleid.com',
      email_verified: 'true',
      nonce: 'n',
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'a1' })
      .setIssuer('https://appleid.apple.com')
      .setAudience('in.chalkpis.web')
      .setSubject('apple-sub')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    let sentSecret = '';
    const fetchFn = (async (_u: string, init: RequestInit) => {
      sentSecret = new URLSearchParams(String(init.body)).get('client_secret')!;
      return new Response(JSON.stringify({ id_token: idToken }));
    }) as unknown as typeof fetch;
    const a = new AppleProvider(
      {
        servicesId: 'in.chalkpis.web',
        teamId: 'TEAM123',
        keyId: 'KEY123',
        privateKey: p8.replace(/\n/g, '\\n'),
      },
      fetchFn,
      jwks,
    );
    const id = await a.exchange({
      code: 'c',
      nonce: 'n',
      redirectUri: 'https://x/cb',
      extra: { user: JSON.stringify({ name: { firstName: 'Meena', lastName: 'Iyer' } }) },
    });
    expect(id).toMatchObject({
      provider: 'apple',
      subject: 'apple-sub',
      emailVerified: true,
      name: 'Meena Iyer',
    });
    expect(decodeJwt(sentSecret)).toMatchObject({
      iss: 'TEAM123',
      sub: 'in.chalkpis.web',
      aud: 'https://appleid.apple.com',
    });
  });

  it('accepts the Apple key however it was pasted, and rejects one that is not a key', async () => {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    const p8 = await exportPKCS8(privateKey);
    const body = p8.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
    const pasted = [
      p8, // as downloaded
      p8.replace(/\n/g, '\\n'), // single line with \n
      `"${p8.replace(/\n/g, '\\n')}"`, // with quotes
      p8.replace(/\n/g, ' '), // line breaks turned into spaces
      body, // just the base64
    ];
    const opts = { servicesId: 's', teamId: 't', keyId: 'k' };
    for (const privateKey of pasted)
      expect(await new AppleProvider({ ...opts, privateKey }).keyWorks()).toBe(true);
    expect(await new AppleProvider({ ...opts, privateKey: 'not a key' }).keyWorks()).toBe(false);
  });
});
