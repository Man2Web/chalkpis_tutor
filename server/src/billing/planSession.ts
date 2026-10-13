import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The sign-in for the billing page (tutor.chalkpis.com/plan): after a WhatsApp code, the browser keeps a signed,
 * HttpOnly cookie with the user id and an expiry, scoped to /plan. Nothing is stored on the server; signing out clears
 * the cookie, and it expires by itself after 12 hours.
 */
const NAME = 'cp_plan';
export const PLAN_SESSION_MS = 12 * 3_600_000;

const mac = (secret: string, payload: string) =>
  createHmac('sha256', createHmac('sha256', secret).update('plan-session').digest())
    .update(payload)
    .digest('base64url');

const attrs = (maxAgeSeconds: number, secure: boolean) =>
  `Path=/plan; Max-Age=${maxAgeSeconds}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export function planSessionCookie(
  secret: string,
  userId: string,
  nowMs: number,
  secure: boolean,
): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: nowMs + PLAN_SESSION_MS })).toString(
    'base64url',
  );
  return `${NAME}=${payload}.${mac(secret, payload)}; ${attrs(PLAN_SESSION_MS / 1000, secure)}`;
}

export const clearPlanSessionCookie = (secure: boolean) => `${NAME}=; ${attrs(0, secure)}`;

/** The signed-in user id, or null when there is no cookie, it was changed, or it has expired. */
export function readPlanSession(
  secret: string,
  cookieHeader: string | undefined,
  nowMs: number,
): string | null {
  const raw = (cookieHeader ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${NAME}=`))
    ?.slice(NAME.length + 1);
  if (!raw || raw.length > 400) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig) return null;
  const a = Buffer.from(mac(secret, payload));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      u?: unknown;
      e?: unknown;
    };
    if (typeof s.u !== 'string' || typeof s.e !== 'number' || s.e <= nowMs) return null;
    return s.u;
  } catch {
    return null;
  }
}
