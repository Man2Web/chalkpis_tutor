/** The months a parent can pay ahead for: this month and the next 12, as yyyy-mm. */
export function advanceMonths(today: string, count = 13): string[] {
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7),
  );
}

/**
 * What the parent will pay for the chosen months: the monthly fee less discount for months not yet billed, and what
 * is still owed on months that already have a due. The server works out the same and has the final word.
 */
export function advanceTotal(
  months: string[],
  fee: { monthly: number; discount: number },
  existing: { period: string; owe: number }[],
): number {
  const byPeriod = new Map(existing.map((d) => [d.period, d.owe]));
  return months.reduce(
    (t, m) =>
      t + (byPeriod.get(m) ?? Math.max(0, fee.monthly - Math.min(fee.discount, fee.monthly))),
    0,
  );
}
