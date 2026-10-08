import {
  addDays,
  attendanceId,
  firstOfMonth,
  lastOfMonth,
  rangeFor,
  todayYmd,
  weekdayOf,
} from '../dates';

describe('dates', () => {
  it('today is in Indian time', () => {
    expect(todayYmd(new Date('2026-03-31T19:00:00Z'))).toBe('2026-04-01'); // 00:30 IST
    expect(todayYmd(new Date('2026-03-31T17:00:00Z'))).toBe('2026-03-31');
  });
  it('addDays crosses month, year and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('weekday', () => {
    expect(weekdayOf('2026-10-08')).toBe('thu');
    expect(weekdayOf('2026-10-11')).toBe('sun');
  });
  it('ids and month edges', () => {
    expect(attendanceId('b1', '2026-03-05')).toBe('b1_20260305');
    expect(firstOfMonth('2026-03-17')).toBe('2026-03-01');
    expect(lastOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(lastOfMonth('2028-02-10')).toBe('2028-02-29');
  });
  it('range presets', () => {
    expect(rangeFor('thisMonth', '2026-10-08')).toEqual({ from: '2026-10-01', to: '2026-10-08' });
    expect(rangeFor('last30', '2026-10-08')).toEqual({ from: '2026-09-09', to: '2026-10-08' });
    expect(rangeFor('lastMonth', '2026-10-08')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(rangeFor('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });
});
