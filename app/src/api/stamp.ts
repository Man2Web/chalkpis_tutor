/** A point in time the screens can read with .toDate() / .toMillis() (what Firestore timestamps used to offer). */
export interface Stamp {
  toDate(): Date;
  toMillis(): number;
}

export function stamp(iso: string): Stamp {
  const d = new Date(iso);
  return { toDate: () => d, toMillis: () => d.getTime() };
}

/** A calendar day (yyyy-mm-dd) as the start of that day in Indian time, so converting back to a day gives the same day. */
export const stampYmd = (ymd: string): Stamp => stamp(`${ymd}T00:00:00+05:30`);
