export const LOW_ATTENDANCE_PERCENT = 75;

export interface Stat {
  present: number;
  late: number;
  absent: number;
  total: number;
  pct: number | null;
}

/** Late counts as attended. Null when there is nothing to measure. */
export function percentage(present: number, late: number, absent: number): number | null {
  const total = present + late + absent;
  return total === 0 ? null : Math.round(((present + late) / total) * 1000) / 10;
}

export const toStat = (present: number, late: number, absent: number): Stat => ({
  present,
  late,
  absent,
  total: present + late + absent,
  pct: percentage(present, late, absent),
});
