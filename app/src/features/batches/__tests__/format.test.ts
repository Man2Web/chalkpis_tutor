import { scheduleLabel } from '../format';

it('formats days and times', () => {
  const t = (k: string) => ({ 'days.mon': 'Mon', 'days.wed': 'Wed' })[k] ?? k;
  expect(scheduleLabel({ days: ['mon', 'wed'], startTime: '17:00', endTime: '18:30' }, t)).toBe(
    'Mon, Wed • 17:00–18:30',
  );
});
