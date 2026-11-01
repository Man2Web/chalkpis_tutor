import { addDays, firstOfMonth, lastOfMonth, weekdayOf } from '../../lib/dates';
import type { Batch, Weekday } from '../../lib/types';

export const KINDS = ['holiday', 'exam', 'event', 'meeting'] as const;
export type EventKind = (typeof KINDS)[number];

export interface CalendarEvent {
  id: string;
  title: string;
  kind: EventKind;
  /** yyyy-mm-dd; the same day for a one-day event. */
  startsOn: string;
  endsOn: string;
  /** null: the whole centre. */
  batchId: string | null;
  batchName: string | null;
  notes: string;
}
export interface CalendarExam {
  id: string;
  name: string;
  subject: string;
  date: string;
  batchId: string;
  batchName: string;
}
export interface CalendarHomework {
  id: string;
  title: string;
  subject: string;
  dueOn: string;
  batchId: string;
  batchName: string;
}
export interface CalendarRange {
  events: CalendarEvent[];
  exams: CalendarExam[];
  homework: CalendarHomework[];
}

export const kindTone = (k: EventKind) =>
  k === 'holiday' ? 'warning' : k === 'exam' ? 'danger' : k === 'meeting' ? 'accent' : 'success';

/** The Monday on or before a day: weeks run Monday to Sunday, as a centre's timetable does. */
export function weekStart(ymd: string): string {
  const back = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }[weekdayOf(ymd)];
  return addDays(ymd, -back);
}

export const weekDays = (ymd: string) => {
  const mon = weekStart(ymd);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mon, i));
};

/** A month as whole weeks, Monday first, with the days of the months either side to fill them. */
export function monthGrid(ymd: string): string[][] {
  const last = lastOfMonth(ymd);
  const weeks: string[][] = [];
  for (let d = weekStart(firstOfMonth(ymd)); d <= last; d = addDays(d, 7)) weeks.push(weekDays(d));
  return weeks;
}

/** The days a calendar view asks the server for. */
export const rangeOf = (days: string[]) => ({ from: days[0]!, to: days[days.length - 1]! });

export const addMonths = (ymd: string, n: number) => {
  const [y, m] = ymd.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
};

/** The active batches that meet on a day of the week, earliest first. */
export function classesOn(batches: Batch[], day: Weekday): Batch[] {
  return batches
    .filter((b) => b.status === 'active' && b.days.includes(day))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name));
}

/** What else is on a day: events covering it, tests on it, homework due on it. */
export function itemsOn(range: CalendarRange | undefined, day: string) {
  return {
    events: (range?.events ?? []).filter((e) => e.startsOn <= day && e.endsOn >= day),
    exams: (range?.exams ?? []).filter((x) => x.date === day),
    homework: (range?.homework ?? []).filter((h) => h.dueOn === day),
  };
}

/** A holiday on the day for the whole centre, or for one batch. Classes still show, marked off. */
export function holidayFor(events: CalendarEvent[], batchId?: string) {
  return events.find((e) => e.kind === 'holiday' && (!e.batchId || e.batchId === batchId));
}

export interface Clash {
  day: Weekday;
  a: Batch;
  b: Batch;
  /** The helper both batches have, or null when neither has one (the owner takes both). */
  teacher: string | null;
}

const overlaps = (a: Batch, b: Batch) => a.startTime < b.endTime && b.startTime < a.endTime;

/**
 * Two batches at overlapping times on the same day with the same teacher: a helper both are assigned to, or the
 * owner when neither has a helper. `teachers` maps a batch to its helpers' ids.
 */
export function clashes(batches: Batch[], teachers: Record<string, string[]>): Clash[] {
  const days: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const out: Clash[] = [];
  for (const day of days) {
    const on = classesOn(batches, day);
    for (let i = 0; i < on.length; i++)
      for (let j = i + 1; j < on.length; j++) {
        const a = on[i]!;
        const b = on[j]!;
        if (!overlaps(a, b)) continue;
        const ta = teachers[a.id] ?? [];
        const tb = teachers[b.id] ?? [];
        if (!ta.length && !tb.length) out.push({ day, a, b, teacher: null });
        else {
          const shared = ta.find((x) => tb.includes(x));
          if (shared) out.push({ day, a, b, teacher: shared });
        }
      }
  }
  return out;
}

/** Hours of class a week, for the timetable's summary. */
export function weeklyHours(batches: Batch[]): number {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const total = batches
    .filter((b) => b.status === 'active')
    .reduce((s, b) => s + Math.max(0, mins(b.endTime) - mins(b.startTime)) * b.days.length, 0);
  return Math.round((total / 60) * 10) / 10;
}

/** The notice an owner forwards to parents about a holiday or event. */
export function eventMessage(
  t: (k: string, o?: Record<string, unknown>) => string,
  e: Pick<CalendarEvent, 'title' | 'kind' | 'startsOn' | 'endsOn' | 'notes' | 'batchName'>,
  centre: string,
  date: (ymd: string) => string,
) {
  const when =
    e.endsOn !== e.startsOn
      ? t('calendar.share.range', { from: date(e.startsOn), to: date(e.endsOn) })
      : date(e.startsOn);
  return [
    t(`calendar.share.${e.kind}`, { title: e.title, when, batch: e.batchName ?? '' }),
    e.notes,
    `— ${centre}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
