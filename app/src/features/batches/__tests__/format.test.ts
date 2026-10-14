import { scheduleLabel } from '../format';

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
