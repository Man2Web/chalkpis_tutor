/**
 * Normalises an Indian mobile number to E.164 (+91XXXXXXXXXX).
 * Accepts: 98765 43210, 098765-43210, 91 98765 43210, +91 98765 43210. Returns null if invalid.
 */
export function normalizeIndianPhone(input: string): string | null {
  let d = input.replace(/[\s\-()]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('0091')) d = d.slice(4);
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

/** 10-digit national number for display / wa.me links without +. */
export const nationalNumber = (e164: string) => e164.replace(/^\+91/, '');
