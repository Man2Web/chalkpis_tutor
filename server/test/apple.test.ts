import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Identity } from '../src/auth/identity.js';
import { AppleNative, type AppleNativeVerifier } from '../src/auth/oauth.js';
import { startHarness, type Harness } from './helpers.js';

const ADMIN = '+919000000001';

/** Stands in for Apple: each identity token maps to a person; anything else is refused. */
class FakeApple implements AppleNativeVerifier {
  people = new Map<string, Identity>();
  lastNonce = '';
  async verify(token: string, nonce: string) {
    this.lastNonce = nonce;
    const id = this.people.get(token);
    if (!id) throw new Error('bad token');
    return id;
  }
}

describe('Sign in with Apple on iPhone: no mobile number needed', () => {
  const apple = new FakeApple();
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ ADMIN_PHONES: [ADMIN] }, { appleNative: apple });
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    apple.people.clear();
    h.provider.sent = [];
  });

  const post = (url: string, payload: unknown, token?: string) =>
    h.app.inject({
      method: 'POST',
      url,
      payload: payload as object,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const nonce = async () => (await post('/auth/apple/nonce', {})).json().nonce as string;
  const appleSignIn = async (token: string, fullName?: object) =>
    post('/auth/apple/native', { identityToken: token, nonce: await nonce(), fullName });

  it('a new person is signed straight in, with the name Apple gave and no phone', async () => {
    apple.people.set('tok-meena-123456789-identity-token', {
      provider: 'apple',
      subject: 'apple-meena',
      email: 'abc123@privaterelay.appleid.com',
      emailVerified: true,
    });
    const r = await appleSignIn('tok-meena-123456789-identity-token', {
      givenName: 'Meena',
      familyName: 'Iyer',
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.needsPhone).toBeUndefined();
    expect(body.accessToken).toBeTruthy();
    expect(body.user).toMatchObject({ phone: null, name: 'Meena Iyer' });
    expect(body.user.email).toBe('abc123@privaterelay.appleid.com');
    expect(body.signInMethods.map((m: { provider: string }) => m.provider)).toEqual(['apple']);
    // next time: the same Apple account, same person (and no second account)
    const again = await appleSignIn('tok-meena-123456789-identity-token');
    expect(again.json().user.id).toBe(body.user.id);
    const [[n]] = (await h.db.pool.query('SELECT COUNT(*) AS n FROM users')) as unknown as [
      [{ n: number }],
    ];
    expect(Number(n!.n)).toBe(1);
  });

  it('an Apple email that matches an existing account signs into that account', async () => {
    const A = await h.tenant('+919876543210', { tutor: 'Asha', institute: 'Alpha' });
    await h.db.pool.query('UPDATE users SET email = ?, email_verified_at = ? WHERE id = ?', [
      'asha@example.com',
      h.clock.now,
      A.userId,
    ]);
    apple.people.set('tok-asha-1234567890-identity-token', {
      provider: 'apple',
      subject: 'apple-asha',
      email: 'asha@example.com',
      emailVerified: true,
    });
    const r = await appleSignIn('tok-asha-1234567890-identity-token');
    expect(r.json().user).toMatchObject({ id: A.userId, phone: '+919876543210' });
  });

  it('nonces come from us and work once; a forged token is refused', async () => {
    apple.people.set('tok-ravi-1234567890-identity-token', {
      provider: 'apple',
      subject: 'apple-ravi',
      email: null,
      emailVerified: false,
    });
    const n = await nonce();
    const ok = await post('/auth/apple/native', {
      identityToken: 'tok-ravi-1234567890-identity-token',
      nonce: n,
    });
    expect(ok.statusCode).toBe(200);
    expect(apple.lastNonce).toBe(n);
    const replay = await post('/auth/apple/native', {
      identityToken: 'tok-ravi-1234567890-identity-token',
      nonce: n,
    });
    expect(replay.statusCode).toBe(401);
    const made = await post('/auth/apple/native', {
      identityToken: 'tok-ravi-1234567890-identity-token',
      nonce: 'x'.repeat(43),
    });
    expect(made.statusCode).toBe(401);
    expect((await appleSignIn('forged-token-0000000000')).statusCode).toBe(401);
  });

  it('the app is told native Apple is available', async () => {
    expect((await h.app.inject({ url: '/auth/methods' })).json().appleNative).toBe(true);
  });

  it('a phone-less account can set up a centre, and add its mobile later by WhatsApp code', async () => {
    apple.people.set('tok-new-12345678901-identity-token', {
      provider: 'apple',
      subject: 'apple-new',
      email: null,
      emailVerified: false,
    });
    const s = (
      await appleSignIn('tok-new-12345678901-identity-token', { givenName: 'Kiran' })
    ).json();
    const token = s.accessToken as string;
    const inst = await post(
      '/institutes',
      { tutorName: 'Kiran', instituteName: 'Kiran Classes' },
      token,
    );
    expect(inst.statusCode).toBe(201);

    // a wrong code, then the right one
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    expect((await post('/me/phone/request', { phone: '9811100000' }, token)).statusCode).toBe(200);
    const code = h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await post('/me/phone/verify', { phone: '9811100000', code: wrong }, token)).statusCode,
    ).toBe(401);
    const done = await post('/me/phone/verify', { phone: '9811100000', code }, token);
    expect(done.statusCode).toBe(200);
    expect(done.json().user.phone).toBe('+919811100000');
    const [[i]] = (await h.db.pool.query('SELECT phone FROM institutes WHERE owner_user_id = ?', [
      s.user.id,
    ])) as unknown as [[{ phone: string }]];
    expect(i!.phone).toBe('+919811100000');
    // only once
    expect((await post('/me/phone/request', { phone: '9811100001' }, token)).statusCode).toBe(409);
  });

  it('a number that already has its own account is not taken over', async () => {
    await h.tenant('+919822200000', { tutor: 'Other' });
    apple.people.set('tok-x-1234567890123-identity-token', {
      provider: 'apple',
      subject: 'apple-x',
      email: null,
      emailVerified: false,
    });
    const token = (await appleSignIn('tok-x-1234567890123-identity-token')).json()
      .accessToken as string;
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    await post('/me/phone/request', { phone: '9822200000' }, token);
    const code = h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
    const r = await post('/me/phone/verify', { phone: '9822200000', code }, token);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('phone_in_use');
  });

  it('the admin dashboard copes with people who have no phone', async () => {
    const admin = await h.tenant(ADMIN, { institute: 'HQ' });
    apple.people.set('tok-y-1234567890123-identity-token', {
      provider: 'apple',
      subject: 'apple-y',
      email: null,
      emailVerified: false,
    });
    const s = (
      await appleSignIn('tok-y-1234567890123-identity-token', { givenName: 'Yash' })
    ).json();
    await post('/institutes', { tutorName: 'Yash', instituteName: 'Yash Academy' }, s.accessToken);
    for (const url of [
      '/admin/api/overview',
      '/admin/api/users',
      `/admin/api/users/${s.user.id}`,
      '/admin/api/institutes',
      '/admin/api/events',
      '/admin/api/search?q=Yash',
      '/admin/api/export/users.csv',
    ])
      expect((await admin.call('GET', url)).status, url).toBe(200);
    // a phone-less account is never an admin
    expect((await h.login(s.user.id, '').call('GET', '/admin/api/overview')).status).toBe(403);
  });
});

describe('the real native Apple token check', () => {
  it('needs Apple’s signature, our bundle id, and our nonce (as given or hashed)', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const now = Date.parse('2026-10-08T06:00:00Z');
    const verifier = new AppleNative('in.chalkpis.tutors', keys, () => now);
    const token = (aud: string, nonce: string) =>
      new SignJWT({ nonce, email: 'A@Example.com', email_verified: 'true' })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer('https://appleid.apple.com')
        .setAudience(aud)
        .setSubject('apple-sub')
        .setIssuedAt(now / 1000)
        .setExpirationTime(now / 1000 + 300)
        .sign(privateKey);
    const nonce = 'n'.repeat(43);
    const hashed = createHash('sha256').update(nonce).digest('hex');
    expect(await verifier.verify(await token('in.chalkpis.tutors', nonce), nonce)).toMatchObject({
      provider: 'apple',
      subject: 'apple-sub',
      email: 'a@example.com',
      emailVerified: true,
    });
    await expect(
      verifier.verify(await token('in.chalkpis.tutors', hashed), nonce),
    ).resolves.toBeTruthy();
    await expect(verifier.verify(await token('com.someone.else', nonce), nonce)).rejects.toThrow();
    await expect(
      verifier.verify(await token('in.chalkpis.tutors', 'other'), nonce),
    ).rejects.toThrow();
  });
});
