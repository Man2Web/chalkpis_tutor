import { greetingKey } from '../../dashboard/greeting';
import { isDiwali } from '../season';

// India time: 7 Nov 00:00 IST is 6 Nov 18:30 UTC
const ist = (iso: string) => new Date(`${iso}+05:30`);

it('is Diwali from 7 to 9 Nov 2026, India time, and not a minute either side', () => {
  expect(isDiwali(ist('2026-11-06T23:59:00'))).toBe(false);
  expect(isDiwali(ist('2026-11-07T00:00:00'))).toBe(true);
  expect(isDiwali(ist('2026-11-08T12:00:00'))).toBe(true);
  expect(isDiwali(ist('2026-11-09T23:59:00'))).toBe(true);
  expect(isDiwali(ist('2026-11-10T00:00:00'))).toBe(false);
  expect(isDiwali(ist('2027-11-08T12:00:00'))).toBe(false);
});

it('greets with Happy Diwali over Diwali and by the time of day after it', () => {
  expect(greetingKey(ist('2026-11-08T09:00:00'))).toBe('diwali');
  expect(greetingKey(ist('2026-11-10T09:00:00'))).toBe('morning');
  expect(greetingKey(ist('2026-11-10T19:00:00'))).toBe('evening');
});
