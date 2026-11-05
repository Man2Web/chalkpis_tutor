import { daysLabel, scheduleLabel } from '../format';

it('formats days and times', () => {
  const t = (k: string) => ({ 'days.mon': 'Mon', 'days.wed': 'Wed' })[k] ?? k;
  expect(scheduleLabel({ days: ['mon', 'wed'], startTime: '17:00', endTime: '18:30' }, t)).toBe(
    'Mon, Wed · 5:00–6:30 PM',
  );
  expect(scheduleLabel({ days: ['mon'], startTime: '11:30', endTime: '13:00' }, t)).toBe(
    'Mon · 11:30 AM–1:00 PM',
  );
  expect(scheduleLabel({ days: ['wed'], startTime: '00:15', endTime: '12:00' }, t)).toBe(
    'Wed · 12:15 AM–12:00 PM',
  );
});

it('shortens three or more days in a row to a range, in week order', () => {
  const t = (k: string) => k.slice(5, 6).toUpperCase() + k.slice(6);
  expect(daysLabel(['sat', 'mon', 'tue', 'wed', 'thu', 'fri'], t)).toBe('Mon–Sat');
  expect(daysLabel(['mon', 'tue', 'wed', 'fri'], t)).toBe('Mon–Wed, Fri');
  expect(daysLabel(['mon', 'tue', 'thu'], t)).toBe('Mon, Tue, Thu');
});

it('can put the time first for a narrow subtitle', () => {
  const t = (k: string) => ({ 'days.mon': 'Mon', 'days.wed': 'Wed' })[k] ?? k;
  expect(
    scheduleLabel({ days: ['mon', 'wed'], startTime: '17:00', endTime: '18:30' }, t, true),
  ).toBe('5:00–6:30 PM · Mon, Wed');
});
