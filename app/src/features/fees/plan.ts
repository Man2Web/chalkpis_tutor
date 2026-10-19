/** Yearly fee plans: the defaults the Fee plan screen offers (all money in paise, dates yyyy-mm-dd). */

export const PART_CHOICES = [1, 2, 3, 4] as const;

/** "2026-27": the academic year a date falls in (it starts in April, as most centres in India count it). */
export function academicYear(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  const start = Number(ymd.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The same day `n` months later, clamped to the month's length (31 Jan + 1 month is 28 or 29 Feb). */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

export interface Part {
  amount: number; // paise
  dueYmd: string;
}

/**
 * Splits a year's fee into equal parts in whole rupees (what is left over goes on the first part), the first due on
 * `startYmd` and the rest spread evenly over the year: 2 parts six months apart, 3 parts four months apart, 4 parts
 * three months apart.
 */
export function splitYearly(totalPaise: number, parts: number, startYmd: string): Part[] {
  const n = Math.max(1, Math.min(12, Math.floor(parts)));
  const rupees = Math.floor(totalPaise / 100);
  const each = Math.floor(rupees / n);
  const gap = Math.floor(12 / n);
  return Array.from({ length: n }, (_, i) => ({
    amount: (each + (i === 0 ? rupees - each * n : 0)) * 100 + (i === 0 ? totalPaise % 100 : 0),
    dueYmd: addMonths(startYmd, gap * i),
  }));
}

export type PartsError = 'amount' | 'date' | 'order';

/** Why these parts cannot be saved, or null. Each needs an amount and a real date, in order. */
export function partsError(parts: { amount: number | null; dueYmd: string }[]): PartsError | null {
  for (const p of parts) if (p.amount === null || p.amount <= 0) return 'amount';
  for (const p of parts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueYmd)) return 'date';
    const d = new Date(`${p.dueYmd}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== p.dueYmd) return 'date';
  }
  return parts.every((p, i) => i === 0 || p.dueYmd >= parts[i - 1]!.dueYmd) ? null : 'order';
}
