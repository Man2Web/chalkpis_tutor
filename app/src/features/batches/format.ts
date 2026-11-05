import { WEEKDAYS, type Batch, type Weekday } from '../../lib/types';

/** "17:00" -> { time: "5:00", period: "PM" }. */
function clock12(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const period = h >= 12 ? 'PM' : 'AM';
  return { time: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}`, period };
}

/** "5:00–6:30 PM", or "11:30 AM–1:00 PM" across noon. */
export function timeRange(start: string, end: string): string {
  const a = clock12(start);
  const b = clock12(end);
  return a.period === b.period
    ? `${a.time}–${b.time} ${b.period}`
    : `${a.time} ${a.period}–${b.time} ${b.period}`;
}

/**
 * "Mon, Wed", with three or more days in a row shortened to a range: "Mon–Sat", "Mon–Wed, Fri". Days come out in
 * week order (Monday first) whatever order they were saved in.
 */
export function daysLabel(days: Weekday[], t: (key: string) => string): string {
  const idx = [...new Set(days)].map((d) => WEEKDAYS.indexOf(d)).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1] === idx[j]! + 1) j++;
    const name = (k: number) => t(`days.${WEEKDAYS[idx[k]!]}`);
    if (j - i >= 2) parts.push(`${name(i)}–${name(j)}`);
    else for (let k = i; k <= j; k++) parts.push(name(k));
    i = j + 1;
  }
  return parts.join(', ');
}

/**
 * "Mon, Wed · 5:00–6:30 PM". `t` is i18next's translate function. `timeFirst` gives "5:00–6:30 PM · Mon–Sat" for a
 * one-line subtitle on a narrow phone, where the end gets cut and the time matters most.
 */
export function scheduleLabel(
  b: Pick<Batch, 'days' | 'startTime' | 'endTime'>,
  t: (key: string) => string,
  timeFirst = false,
): string {
  const days = daysLabel(b.days, t);
  const time = timeRange(b.startTime, b.endTime);
  return timeFirst ? `${time} · ${days}` : `${days} · ${time}`;
}
