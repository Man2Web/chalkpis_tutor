/** Indian-time calendar helpers. Dates are plain yyyy-mm-dd strings; the institute's day is the Indian day. */
const IST = 'Asia/Kolkata';
const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const ymdRe = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const todayYmd = (now: Date) => now.toLocaleDateString('en-CA', { timeZone: IST });
export const currentPeriod = (now: Date) => todayYmd(now).slice(0, 7);

/** True only for real calendar dates (rejects 2026-02-31). */
export function isRealDate(ymd: string): boolean {
  if (!ymdRe.test(ymd)) return false;
  return new Date(`${ymd}T00:00:00Z`).toISOString().slice(0, 10) === ymd;
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export const weekdayOf = (ymd: string) => DAY_NAMES[new Date(`${ymd}T00:00:00Z`).getUTCDay()]!;

/** When a payment is stamped: today keeps the real time, any other day is noon Indian time. */
export function paidAtFor(ymd: string, now: Date): Date {
  return ymd === todayYmd(now) ? now : new Date(`${ymd}T12:00:00+05:30`);
}

/** The Indian calendar day an instant falls on. */
export const ymdOf = (d: Date) => todayYmd(d);

/** The hour (0-23) on the Indian clock. */
export const istHour = (now: Date) =>
  Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', hourCycle: 'h23' }).format(
      now,
    ),
  );
