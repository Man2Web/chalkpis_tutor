import { isDiwali } from '../diwali/season';

/** Good morning / afternoon / evening, by the time in India; "Happy Diwali" over Diwali. */
export function greetingKey(
  now: Date = new Date(),
): 'morning' | 'afternoon' | 'evening' | 'diwali' {
  if (isDiwali(now)) return 'diwali';
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(now),
  );
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
