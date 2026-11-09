import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The sign-in for the billing page (tutor.chalkpis.com/plan): after a WhatsApp code, the browser keeps a signed,
 * HttpOnly cookie with the user id, an expiry and the user's sign-out count (users.plan_session_epoch), scoped to /plan.
 * Signing out raises that count, so every earlier cookie of that person stops working (hardening, 9 Nov 2026); it also
 * expires by itself after 12 hours. A cookie made before the count existed reads as 0.
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
  epoch: number,
  nowMs: number,
  secure: boolean,
): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: nowMs + PLAN_SESSION_MS, v: epoch }),
  ).toString('base64url');
  return `${NAME}=${payload}.${mac(secret, payload)}; ${attrs(PLAN_SESSION_MS / 1000, secure)}`;
}

export const clearPlanSessionCookie = (secure: boolean) => `${NAME}=; ${attrs(0, secure)}`;

/**
 * The signed-in user id and the sign-out count the cookie was made at, or null when there is no cookie, it was changed,
 * or it has expired. The caller compares the count with the user's current one.
 */
export function readPlanSession(
  secret: string,
  cookieHeader: string | undefined,
  nowMs: number,
): { userId: string; epoch: number } | null {
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
      v?: unknown;
    };
    if (typeof s.u !== 'string' || typeof s.e !== 'number' || s.e <= nowMs) return null;
    const epoch = s.v === undefined ? 0 : s.v;
    if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch < 0) return null;
    return { userId: s.u, epoch };
  } catch {
    return null;
  }
}
