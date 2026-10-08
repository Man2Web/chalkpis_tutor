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
  const expected = sign(`${h}.${p}`, secret);
  let given: Buffer;
  try {
    given = Buffer.from(s, 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
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
