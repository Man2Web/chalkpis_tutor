/** One student's result in a test: their marks, or absent. */
export interface Result {
  studentId: string;
  marks: number | null;
  absent: boolean;
}

/**
 * Rank of every student who sat the test, highest marks first. Equal marks share a rank and the next rank skips
 * (98, 95, 95, 90 → 1, 2, 2, 4), as on Indian merit lists. Absent or not yet marked: no rank.
 */
export function ranks(results: Result[]): Map<string, number> {
  const sat = results
    .filter((r) => !r.absent && r.marks !== null)
    .sort((a, b) => (b.marks as number) - (a.marks as number));
  const out = new Map<string, number>();
  sat.forEach((r, i) => {
    const prev = sat[i - 1];
    out.set(r.studentId, prev && prev.marks === r.marks ? out.get(prev.studentId)! : i + 1);
  });
  return out;
}

/** Marks as a percentage of the maximum, to one decimal. */
export const percentOf = (marks: number, max: number) =>
  max > 0 ? Math.round((marks / max) * 1000) / 10 : 0;

/** The average of those who sat the test, to one decimal; null when nobody has marks yet. */
export function average(results: Result[]): number | null {
  const sat = results.filter((r) => !r.absent && r.marks !== null);
  if (!sat.length) return null;
  return Math.round((sat.reduce((t, r) => t + (r.marks as number), 0) / sat.length) * 10) / 10;
}
