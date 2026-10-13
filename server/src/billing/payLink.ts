import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A centre's own pay page address: tutor.chalkpis.com/pay/<token>. The token is the centre id (22 characters) plus a
 * signature, so it cannot be guessed or changed to another centre, and it stays the same for as long as the server
 * secret does (a link sent once keeps working). All it lets anyone do is pay for that centre's plan.
 */
const mac = (secret: string, instituteId: string) =>
  createHmac('sha256', secret).update(`pay:${instituteId}`).digest('base64url').slice(0, 16);

export function payToken(secret: string, instituteId: string): string {
  const id = Buffer.from(instituteId.replace(/-/g, ''), 'hex').toString('base64url');
  return `${id}${mac(secret, instituteId)}`;
}

/** The centre id a pay token stands for, or null when it is malformed or not signed by us. */
export function parsePayToken(secret: string, token: string): string | null {
  if (!/^[A-Za-z0-9_-]{38}$/.test(token)) return null;
  const hex = Buffer.from(token.slice(0, 22), 'base64url').toString('hex');
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const a = Buffer.from(mac(secret, id));
  const b = Buffer.from(token.slice(22));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export const payUrl = (baseUrl: string | undefined, secret: string, instituteId: string) =>
  `${(baseUrl ?? '').replace(/\/$/, '')}/pay/${payToken(secret, instituteId)}`;
