/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts 98765 43210, 098765-43210, 91 98765 43210, +91 98765 43210. Returns null if it is not a valid mobile number.
 */
export function normalizeIndianPhone(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  let d = input.replace(/[\s\-()]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** "+91••••••3210": for places where the number must not appear in full (logs, errors). */
export const maskPhone = (e164: string) =>
  `${e164.slice(0, 3)}${'•'.repeat(Math.max(0, e164.length - 7))}${e164.slice(-4)}`;
