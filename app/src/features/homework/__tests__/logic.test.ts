import { dueLabel, groupMessage, missingMessage, quickDueDays, tally } from '../logic';

const t = (key: string, o: Record<string, unknown> = {}) =>
  `${key}${Object.entries(o)
    .map(([k, v]) => ` ${k}=${String(v)}`)
    .join('')}`;

describe('homework', () => {
  it('says how far off the due day is', () => {
    const today = '2026-11-01';
    expect(dueLabel(t, '2026-10-31', today)).toEqual({ text: 'homework.overdue', late: true });
    expect(dueLabel(t, today, today).text).toBe('homework.dueToday');
    expect(dueLabel(t, '2026-11-02', today).text).toBe('homework.dueTomorrow');
    expect(dueLabel(t, '2026-11-05', today).text).toBe('homework.dueInDays count=4');
  });

  it('is overdue only while someone is still not checked', () => {
    const today = '2026-11-01';
    expect(dueLabel(t, '2026-10-31', today, { unchecked: 2, dateText: '31 Oct' })).toEqual({
      text: 'homework.overdue',
      late: true,
    });
    expect(dueLabel(t, '2026-10-31', today, { unchecked: 0, dateText: '31 Oct' })).toEqual({
      text: 'homework.wasDue date=31 Oct',
      late: false,
      closed: true,
    });
    // not due yet: everyone checked early changes nothing
    expect(dueLabel(t, '2026-11-02', today, { unchecked: 0, dateText: '2 Nov' }).text).toBe(
      'homework.dueTomorrow',
    );
  });

  it('offers tomorrow, the day after and a week as quick due days', () => {
    expect(quickDueDays('2026-12-30').map((q) => q.date)).toEqual([
      '2026-12-31',
      '2027-01-01',
      '2027-01-06',
    ]);
  });

  it('counts done, missing and not checked over the batch', () => {
    const checks = new Map([
      ['a', 'done' as const],
      ['b', 'missing' as const],
      ['z', 'done' as const], // not in the batch any more: not counted
    ]);
    expect(tally(['a', 'b', 'c'], checks)).toEqual({ done: 1, missing: 1, unchecked: 1 });
  });

  it('writes the group message and the note to a parent', () => {
    const hw = {
      title: 'Ex 4.2',
      subject: 'Algebra',
      details: 'Show steps',
      batchName: '10A',
      dueText: 'Fri, 7 Nov',
    };
    expect(groupMessage(t, hw).split('\n')).toEqual([
      'homework.msg.groupHead batch=10A due=Fri, 7 Nov',
      'Algebra: Ex 4.2',
      'Show steps',
    ]);
    expect(missingMessage(t, { institute: 'Vidya', student: 'Ravi', homework: hw })).toBe(
      'homework.msg.missing institute=Vidya student=Ravi work=Algebra: Ex 4.2 due=Fri, 7 Nov',
    );
  });
});
