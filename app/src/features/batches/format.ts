import type { Batch } from '../../lib/types';

/** "Mon, Wed • 17:00–18:30". `t` is i18next's translate function. */
export function scheduleLabel(
  b: Pick<Batch, 'days' | 'startTime' | 'endTime'>,
  t: (key: string) => string,
): string {
  const days = b.days.map((d) => t(`days.${d}`)).join(', ');
  return `${days} • ${b.startTime}–${b.endTime}`;
}
