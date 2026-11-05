import { dateToYmd, formatTime12, joinTime, splitTime, ymdToDate } from '../PickerFields';

describe('time picker values', () => {
  it('reads a 24-hour time as hour, minutes and AM/PM', () => {
    expect(splitTime('17:30')).toEqual({ h12: 5, m: 30, pm: true });
    expect(splitTime('00:05')).toEqual({ h12: 12, m: 5, pm: false });
    expect(splitTime('12:00')).toEqual({ h12: 12, m: 0, pm: true });
    // nothing readable: the usual start of an evening class
    expect(splitTime('')).toEqual({ h12: 5, m: 0, pm: true });
  });

  it('writes it back in the form the server keeps', () => {
    expect(joinTime(5, 30, true)).toBe('17:30');
    expect(joinTime(12, 0, false)).toBe('00:00');
    expect(joinTime(12, 15, true)).toBe('12:15');
    expect(joinTime(9, 5, false)).toBe('09:05');
  });

  it('shows it as the rest of the app does', () => {
    expect(formatTime12('17:30')).toBe('5:30 PM');
    expect(formatTime12('09:00')).toBe('9:00 AM');
    expect(formatTime12('00:00')).toBe('12:00 AM');
  });

  it('round-trips every 5-minute step of the day', () => {
    for (let h = 0; h < 24; h++)
      for (let m = 0; m < 60; m += 5) {
        const v = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const p = splitTime(v);
        expect(joinTime(p.h12, p.m, p.pm)).toBe(v);
      }
  });
});

describe('date picker values', () => {
  it('turns YYYY-MM-DD into a local date and back without a day shift', () => {
    for (const ymd of ['2026-11-05', '2026-01-01', '2026-03-31', '2012-02-29'])
      expect(dateToYmd(ymdToDate(ymd))).toBe(ymd);
  });
});
