import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Short signed links that stand for one record (a centre, a student): the record's UUID as 22 characters plus a
 * 16-character signature for one purpose, so a link cannot be guessed, changed to another record or reused for
 * another purpose. They stay the same for as long as the server secret does (a link sent once keeps working).
 *
 * - pay:  tutor.chalkpis.com/pay/<token>  a centre's pay page (all it lets anyone do is pay for that centre's plan)
 * - paid: tutor.chalkpis.com/f/<token>    a parent says "I've paid" for a student (the tutor still confirms it)
 */
type Purpose = 'pay' | 'paid';

const mac = (secret: string, purpose: Purpose, id: string) =>
  createHmac('sha256', secret).update(`${purpose}:${id}`).digest('base64url').slice(0, 16);

export function signId(secret: string, purpose: Purpose, id: string): string {
  return `${Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url')}${mac(secret, purpose, id)}`;
}

/** The UUID a token stands for, or null when it is malformed or not signed by us for this purpose. */
export function readId(secret: string, purpose: Purpose, token: string): string | null {
  if (!/^[A-Za-z0-9_-]{38}$/.test(token)) return null;
  const hex = Buffer.from(token.slice(0, 22), 'base64url').toString('hex');
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const a = Buffer.from(mac(secret, purpose, id));
  const b = Buffer.from(token.slice(22));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export const payToken = (secret: string, instituteId: string) => signId(secret, 'pay', instituteId);
export const parsePayToken = (secret: string, token: string) => readId(secret, 'pay', token);
export const payUrl = (baseUrl: string | undefined, secret: string, instituteId: string) =>
  `${(baseUrl ?? '').replace(/\/$/, '')}/pay/${payToken(secret, instituteId)}`;

/** The page where a parent says they have paid a student's fees. */
export const paidUrl = (baseUrl: string | undefined, secret: string, studentId: string) =>
  `${(baseUrl ?? '').replace(/\/$/, '')}/f/${signId(secret, 'paid', studentId)}`;
