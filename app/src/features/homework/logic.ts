import { addDays } from '../../lib/dates';

export type Check = 'done' | 'missing';

/** Translate function, as i18next gives it. */
type T = (key: string, opts?: Record<string, unknown>) => string;

/** How far off the due day is, from today: overdue, today, tomorrow, or in N days. */
export function dueLabel(t: T, dueOn: string, today: string): { text: string; late: boolean } {
  if (dueOn < today) return { text: t('homework.overdue'), late: true };
  if (dueOn === today) return { text: t('homework.dueToday'), late: false };
  if (dueOn === addDays(today, 1)) return { text: t('homework.dueTomorrow'), late: false };
  let n = 2;
  while (addDays(today, n) < dueOn && n < 366) n += 1;
  return { text: t('homework.dueInDays', { count: n }), late: false };
}

/** Quick picks for the due day: tomorrow, the day after, and a week from today. */
export const quickDueDays = (today: string) => [
  { key: 'tomorrow', date: addDays(today, 1) },
  { key: 'twoDays', date: addDays(today, 2) },
  { key: 'nextWeek', date: addDays(today, 7) },
];

/** Counts for a list of checks over a roster: done, missing, and not checked yet. */
export function tally(roster: string[], checks: Map<string, Check>) {
  let done = 0;
  let missing = 0;
  for (const id of roster) {
    const c = checks.get(id);
    if (c === 'done') done += 1;
    else if (c === 'missing') missing += 1;
  }
  return { done, missing, unchecked: roster.length - done - missing };
}

export interface HomeworkLike {
  title: string;
  subject: string;
  details: string;
  batchName: string;
  dueText: string;
}

/** The homework for the batch's WhatsApp group. */
export function groupMessage(t: T, h: HomeworkLike): string {
  return [
    t('homework.msg.groupHead', { batch: h.batchName, due: h.dueText }),
    h.subject ? `${h.subject}: ${h.title}` : h.title,
    h.details,
  ]
    .filter(Boolean)
    .join('\n');
}

/** A note to one parent whose child did not hand the homework in. */
export function missingMessage(
  t: T,
  o: { institute: string; student: string; homework: HomeworkLike },
): string {
  const work = o.homework.subject ? `${o.homework.subject}: ${o.homework.title}` : o.homework.title;
  return t('homework.msg.missing', {
    institute: o.institute,
    student: o.student,
    work,
    due: o.homework.dueText,
  });
}
