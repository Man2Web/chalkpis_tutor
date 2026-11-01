import { addDays } from '../../lib/dates';

export const STAGES = ['new', 'follow_up', 'trial', 'joined', 'lost'] as const;
export type Stage = (typeof STAGES)[number];
/** Stages still being worked on. */
export const OPEN_STAGES: Stage[] = ['new', 'follow_up', 'trial'];
export const SOURCES = [
  'walk_in',
  'phone',
  'whatsapp',
  'referral',
  'social',
  'poster',
  'other',
] as const;
export type Source = (typeof SOURCES)[number];

/** The colour a stage is shown in. */
export const stageTone = (s: Stage) =>
  (
    ({
      new: 'accent',
      follow_up: 'warning',
      trial: 'accent',
      joined: 'success',
      lost: 'neutral',
    }) as const
  )[s];

/** Translate function, as i18next gives it. */
type T = (key: string, opts?: Record<string, unknown>) => string;

/** When the next follow-up is: overdue, today, tomorrow, or its date. */
export function followUpLabel(
  t: T,
  next: string | null,
  today: string,
  dateText: (ymd: string) => string,
): { text: string; tone: 'danger' | 'warning' | 'neutral' } | null {
  if (!next) return null;
  if (next < today) return { text: t('enquiries.followOverdue'), tone: 'danger' };
  if (next === today) return { text: t('enquiries.followToday'), tone: 'warning' };
  if (next === addDays(today, 1)) return { text: t('enquiries.followTomorrow'), tone: 'neutral' };
  return { text: t('enquiries.followOn', { date: dateText(next) }), tone: 'neutral' };
}

/** Quick picks for the next follow-up. */
export const quickFollowUps = (today: string) => [
  { key: 'today', date: today },
  { key: 'tomorrow', date: addDays(today, 1) },
  { key: 'threeDays', date: addDays(today, 3) },
  { key: 'nextWeek', date: addDays(today, 7) },
];

/** Joined out of all enquiries, as a whole percentage; null with no enquiries. */
export const conversion = (joined: number, total: number) =>
  total > 0 ? Math.round((joined / total) * 100) : null;

/** The first WhatsApp to the family: thanks, what they asked about, and an invitation. */
export function welcomeMessage(
  t: T,
  o: { institute: string; parent: string; child: string; interest: string },
): string {
  const greeting = o.parent
    ? t('enquiries.msg.helloName', { name: o.parent })
    : t('enquiries.msg.hello');
  return [
    greeting,
    o.interest
      ? t('enquiries.msg.thanksFor', {
          institute: o.institute,
          child: o.child,
          interest: o.interest,
        })
      : t('enquiries.msg.thanks', { institute: o.institute, child: o.child }),
    t('enquiries.msg.invite'),
  ].join('\n');
}
