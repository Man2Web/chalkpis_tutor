import type { Batch } from '../../lib/types';

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

/** "Mon, Wed · 5:00–6:30 PM". `t` is i18next's translate function. */
export function scheduleLabel(
  b: Pick<Batch, 'days' | 'startTime' | 'endTime'>,
  t: (key: string) => string,
): string {
  const days = b.days.map((d) => t(`days.${d}`)).join(', ');
  return `${days} · ${timeRange(b.startTime, b.endTime)}`;
}
