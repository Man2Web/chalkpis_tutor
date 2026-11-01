import type { Batch } from '../../../lib/types';
import {
  addMonths,
  clashes,
  classesOn,
  eventMessage,
  holidayFor,
  itemsOn,
  monthGrid,
  weekDays,
  weekStart,
  weeklyHours,
  type CalendarEvent,
} from '../logic';

const batch = (over: Partial<Batch>): Batch => ({
  id: 'b',
  name: 'Maths',
  subject: 'Maths',
  class: '10',
  days: ['mon', 'wed'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 0,
  status: 'active',
  staffUids: [],
  studentCount: 10,
  ...over,
});
const event = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e',
  title: 'Diwali',
  kind: 'holiday',
  startsOn: '2026-11-07',
  endsOn: '2026-11-10',
  batchId: null,
  batchName: null,
  notes: '',
  ...over,
});

describe('weeks and months', () => {
  it('starts a week on Monday', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // a Sunday
    expect(weekStart('2026-11-02')).toBe('2026-11-02'); // a Monday
    expect(weekDays('2026-11-04')).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
  });

  it('lays a month out as whole weeks', () => {
    const nov = monthGrid('2026-11-15');
    expect(nov[0]![0]).toBe('2026-10-26');
    expect(nov[nov.length - 1]![6]).toBe('2026-12-06');
    expect(nov.every((w) => w.length === 7)).toBe(true);
    expect(monthGrid('2027-02-10')).toHaveLength(4); // Feb 2027 starts on a Monday
  });

  it('moves by months from the first of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01');
  });
});

describe('the day', () => {
  it('lists the active batches that meet that weekday, earliest first', () => {
    const list = classesOn(
      [
        batch({ id: 'late', startTime: '18:00', endTime: '19:00' }),
        batch({ id: 'early', startTime: '16:00', endTime: '17:00' }),
        batch({ id: 'tue', days: ['tue'] }),
        batch({ id: 'old', status: 'archived' }),
      ],
      'mon',
    );
    expect(list.map((b) => b.id)).toEqual(['early', 'late']);
  });

  it('finds events covering a day, tests on it and homework due', () => {
    const range = {
      events: [event({})],
      exams: [
        { id: 'x', name: 'UT', subject: '', date: '2026-11-08', batchId: 'b', batchName: 'M' },
      ],
      homework: [
        { id: 'h', title: 'Q', subject: '', dueOn: '2026-11-09', batchId: 'b', batchName: 'M' },
      ],
    };
    expect(itemsOn(range, '2026-11-08')).toMatchObject({
      events: [{ id: 'e' }],
      exams: [{ id: 'x' }],
      homework: [],
    });
    expect(itemsOn(range, '2026-11-11').events).toEqual([]);
    expect(itemsOn(undefined, '2026-11-11').exams).toEqual([]);
  });

  it('marks a holiday for the whole centre or one batch', () => {
    expect(holidayFor([event({})], 'b')).toBeTruthy();
    expect(holidayFor([event({ batchId: 'other' })], 'b')).toBeUndefined();
    expect(holidayFor([event({ kind: 'event' })], 'b')).toBeUndefined();
  });
});

describe('clashes', () => {
  const a = batch({ id: 'a', days: ['mon'], startTime: '17:00', endTime: '18:00' });
  const b = batch({ id: 'b', days: ['mon', 'tue'], startTime: '17:30', endTime: '18:30' });
  const c = batch({ id: 'c', days: ['mon'], startTime: '18:30', endTime: '19:30' });

  it('flags overlapping batches the owner takes alone', () => {
    expect(clashes([a, b, c], {})).toEqual([{ day: 'mon', a, b, teacher: null }]);
  });

  it('flags a helper booked twice, but not two helpers at once', () => {
    expect(clashes([a, b], { a: ['s1'], b: ['s1', 's2'] })).toEqual([
      { day: 'mon', a, b, teacher: 's1' },
    ]);
    expect(clashes([a, b], { a: ['s1'], b: ['s2'] })).toEqual([]);
  });

  it('counts the hours taught in a week', () => {
    expect(weeklyHours([a, b, batch({ status: 'archived' })])).toBe(3);
  });
});

it('writes a notice for parents', () => {
  const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`;
  const msg = eventMessage(
    t,
    event({ notes: 'Classes resume on 11 Nov' }),
    'Alpha Tuition',
    (d) => d,
  );
  expect(msg).toBe(
    'calendar.share.holiday{"title":"Diwali","when":"calendar.share.range{\\"from\\":\\"2026-11-07\\",\\"to\\":\\"2026-11-10\\"}","batch":""}\n\nClasses resume on 11 Nov\n\n— Alpha Tuition',
  );
});
