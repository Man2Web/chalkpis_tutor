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

/**
 * `version` lets one record's links be cancelled without touching anyone else's (hardening, 9 Nov 2026): it is part of
 * the signature, so raising it (students.link_version) makes every earlier link for that record stop working. Version 0
 * signs exactly as before, so links already sent keep working until a record's version is first raised.
 */
const mac = (secret: string, purpose: Purpose, id: string, version = 0) =>
  createHmac('sha256', secret)
    .update(version ? `${purpose}:${id}:v${version}` : `${purpose}:${id}`)
    .digest('base64url')
    .slice(0, 16);

export function signId(secret: string, purpose: Purpose, id: string, version = 0): string {
  return `${Buffer.from(id.replace(/-/g, ''), 'hex').toString('base64url')}${mac(secret, purpose, id, version)}`;
}

/** The UUID a token claims to stand for, or null when it is malformed (not yet checked against a signature). */
export function idOf(token: string): string | null {
  if (!/^[A-Za-z0-9_-]{38}$/.test(token)) return null;
  const head = token.slice(0, 22);
  const bytes = Buffer.from(head, 'base64url');
  // one canonical spelling only: the 22nd character's spare bits must be zero
  if (bytes.length !== 16 || bytes.toString('base64url') !== head) return null;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether `token` is our signature for this record, purpose and version. */
export function checkId(secret: string, purpose: Purpose, token: string, id: string, version = 0) {
  const a = Buffer.from(mac(secret, purpose, id, version));
  const b = Buffer.from(token.slice(22));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The UUID a token stands for, or null when it is malformed or not signed by us for this purpose (version 0). */
export function readId(secret: string, purpose: Purpose, token: string): string | null {
  const id = idOf(token);
  return id && checkId(secret, purpose, token, id) ? id : null;
}

export const payToken = (secret: string, instituteId: string) => signId(secret, 'pay', instituteId);
export const parsePayToken = (secret: string, token: string) => readId(secret, 'pay', token);
export const payUrl = (baseUrl: string | undefined, secret: string, instituteId: string) =>
  `${(baseUrl ?? '').replace(/\/$/, '')}/pay/${payToken(secret, instituteId)}`;

/**
 * Whether the admin dashboard still offers a centre its pay page link (decision 157): while it is on its free trial
 * (running or ended) and again once a paid plan has ended. Not while a paid plan runs, and not while auto-renew through
 * the store or the website is on, since the pay page refuses a second payment then; the dashboard shows the plan instead
 * (a plan an admin gave counts as running too; the card then says it was given, not paid).
 */
export function offersPayLink(i: {
  plan: string | null;
  planActive: boolean;
  store: { willRenew: boolean } | null;
  webAutoRenew: unknown;
}): boolean {
  if (i.planActive && !!i.plan && i.plan !== 'trial') return false;
  return !i.store?.willRenew && !i.webAutoRenew;
}

/** The page where a parent says they have paid a student's fees. `version`: the student's link_version. */
export const paidUrl = (
  baseUrl: string | undefined,
  secret: string,
  studentId: string,
  version = 0,
) => `${(baseUrl ?? '').replace(/\/$/, '')}/f/${signId(secret, 'paid', studentId, version)}`;
