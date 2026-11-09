import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../src/lib/jwt.js';
import { maskPhone, normalizeIndianPhone } from '../src/lib/phone.js';

describe('normalizeIndianPhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['91 98765 43210', '+919876543210'],
    ['+91 (98765) 43210', '+919876543210'],
    ['0091 9876543210', '+919876543210'],
  ])('accepts %s', (i, o) => expect(normalizeIndianPhone(i)).toBe(o));
  it.each([
    '',
    '12345',
    '5876543210',
    '98765432101',
    '+1 415 555 0100',
    'abcdefghij',
    '9876543210; DROP TABLE users',
    'x'.repeat(200),
  ])('rejects %s', (i) => expect(normalizeIndianPhone(i)).toBeNull());
  it('rejects non-strings', () => {
    for (const v of [undefined, null, 9876543210, {}, ['9876543210']])
      expect(normalizeIndianPhone(v)).toBeNull();
  });
  it('masks a number for logs', () => expect(maskPhone('+919876543210')).toBe('+91••••••3210'));
});

describe('tokens', () => {
  const secret = 'a-test-secret-that-is-long-enough-1234';
  const now = Date.parse('2026-10-08T06:00:00Z');

  it('round-trips the user id and expires', () => {
    const t = signToken('user-1', secret, 900, now);
    expect(verifyToken(t, secret, now + 1000)).toMatchObject({
      sub: 'user-1',
      typ: 'access',
      iat: now / 1000,
      exp: now / 1000 + 900,
    });
    expect(verifyToken(t, secret, now + 899_000)).not.toBeNull();
    expect(verifyToken(t, secret, now + 900_000)).toBeNull();
  });
  it('rejects a wrong secret, a changed payload and a changed signature', () => {
    const t = signToken('user-1', secret, 900, now);
    const [h, p, s] = t.split('.') as [string, string, string];
    expect(verifyToken(t, 'another-secret-another-secret-1234', now)).toBeNull();
    const forged = Buffer.from(
      JSON.stringify({ sub: 'admin', typ: 'access', iat: 0, exp: 99999999999 }),
    ).toString('base64url');
    expect(verifyToken(`${h}.${forged}.${s}`, secret, now)).toBeNull();
    expect(verifyToken(`${h}.${p}.${s.slice(0, -2)}AA`, secret, now)).toBeNull();
  });
  it('rejects alg "none" and other headers even with a valid-looking body', () => {
    const body = Buffer.from(
      JSON.stringify({ sub: 'admin', typ: 'access', iat: now / 1000, exp: now / 1000 + 900 }),
    ).toString('base64url');
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifyToken(`${none}.${body}.`, secret, now)).toBeNull();
    const hs512 = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
    const sig = createHmac('sha512', secret).update(`${hs512}.${body}`).digest('base64url');
    expect(verifyToken(`${hs512}.${body}.${sig}`, secret, now)).toBeNull();
  });
  it('accepts only the one canonical spelling of the signature', () => {
    const t = signToken('user-1', secret, 900, now);
    const [h, p, s] = t.split('.') as [string, string, string];
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    // the last character carries 2 spare bits: flipping them decodes to the same bytes, but is another string
    const spare = `${s.slice(0, -1)}${B64[B64.indexOf(s.slice(-1)) ^ 1]}`;
    expect(Buffer.from(spare, 'base64url').equals(Buffer.from(s, 'base64url'))).toBe(true);
    for (const sig of [spare, `${s}=`, `${s.slice(0, 10)}*${s.slice(10)}`, s.replace(/-/g, '+')])
      if (sig !== s) expect(verifyToken(`${h}.${p}.${sig}`, secret, now)).toBeNull();
    expect(verifyToken(`${h}.${p}=.${s}`, secret, now)).toBeNull();
    expect(verifyToken(t, secret, now)).not.toBeNull();
  });
  it('rejects junk without throwing', () => {
    for (const v of [undefined, null, 5, '', 'a.b', 'a.b.c.d', 'x'.repeat(5000), '..'])
      expect(verifyToken(v, secret, now)).toBeNull();
  });
});
