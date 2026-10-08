/** Calendar dates are plain 'yyyy-mm-dd' strings in Indian time, so they sort and compare as text. */
const IST = 'Asia/Kolkata';

export const todayYmd = (now: Date = new Date()) =>
  now.toLocaleDateString('en-CA', { timeZone: IST });

export const toYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: IST });

const toUtc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

export function addDays(ymd: string, days: number): string {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const weekdayOf = (ymd: string) => WEEKDAYS[toUtc(ymd).getUTCDay()];

/** yyyymmdd, used in attendance document ids. */
export const compact = (ymd: string) => ymd.replace(/-/g, '');
export const attendanceId = (batchId: string, ymd: string) => `${batchId}_${compact(ymd)}`;

export const firstOfMonth = (ymd: string) => `${ymd.slice(0, 7)}-01`;
export const lastOfMonth = (ymd: string) => {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export type RangePreset = 'thisMonth' | 'lastMonth' | 'last30';

export function rangeFor(preset: RangePreset, today: string): { from: string; to: string } {
  if (preset === 'thisMonth') return { from: firstOfMonth(today), to: today };
  if (preset === 'last30') return { from: addDays(today, -29), to: today };
  const prevMonthDay = addDays(firstOfMonth(today), -1);
  return { from: firstOfMonth(prevMonthDay), to: lastOfMonth(prevMonthDay) };
}

/** "Mon, 5 Oct" for display. */
export const prettyDate = (ymd: string, locale = 'en-IN') =>
  toUtc(ymd).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
