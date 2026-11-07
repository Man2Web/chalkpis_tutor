import { todayYmd } from '../../lib/dates';

/**
 * Diwali 2026 on Home (decision 172): Deepavali morning is Sat 7 Nov in Tamil Nadu, Lakshmi Puja Sun 8 Nov.
 * Everything Diwali shows from 7 Nov to 9 Nov, India time, and hides itself from 10 Nov with no update needed.
 * To remove the code later: delete this folder, the `diwali` greeting, the two <DiwaliCard /> lines and the
 * `diwali` strings in en.json.
 */
export const DIWALI_FROM = '2026-11-07';
export const DIWALI_TO = '2026-11-09';

export function isDiwali(now: Date = new Date()): boolean {
  const d = todayYmd(now);
  return d >= DIWALI_FROM && d <= DIWALI_TO;
}
