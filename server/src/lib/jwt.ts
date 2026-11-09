import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HS256 tokens. Written out (not a library) so the rules are visible and testable:
 * the algorithm is fixed (no "alg: none", no switching), the signature is compared in constant time,
 * and expiry is always checked.
 */
export interface Claims {
  sub: string; // user id
  typ: 'access';
  iat: number; // seconds
  exp: number; // seconds
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const HEADER = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

export function signToken(
  sub: string,
  secret: string,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  const iat = Math.floor(nowMs / 1000);
  const body = b64(
    JSON.stringify({ sub, typ: 'access', iat, exp: iat + ttlSeconds } satisfies Claims),
  );
  const data = `${HEADER}.${body}`;
  return `${data}.${b64(sign(data, secret))}`;
}

/** The claims if the token is genuine and unexpired, otherwise null. Never throws. */
export function verifyToken(
  token: unknown,
  secret: string,
  nowMs: number = Date.now(),
): Claims | null {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  if (h !== HEADER) return null; // exactly our header: rejects alg none, RS256 confusion, anything else
  // Strict: exactly the 43 base64url characters of a 32-byte HMAC, in their one canonical spelling. Node's decoder
  // would otherwise skip stray characters and ignore spare bits, so many strings would pass for one signature.
  if (!/^[A-Za-z0-9_-]{43}$/.test(s) || !/^[A-Za-z0-9_-]+$/.test(p)) return null;
  const expected = sign(`${h}.${p}`, secret);
  const given = Buffer.from(s, 'base64url');
  if (given.length !== expected.length || given.toString('base64url') !== s) return null;
  if (!timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Partial<Claims>;
    if (
      c.typ !== 'access' ||
      typeof c.sub !== 'string' ||
      typeof c.exp !== 'number' ||
      typeof c.iat !== 'number'
    )
      return null;
    if (c.exp * 1000 <= nowMs) return null;
    return c as Claims;
  } catch {
    return null;
  }
}
