import type { AttendanceDoc, Student } from '../../../lib/types';
import {
  batchStats,
  buildRoster,
  tapMark,
  counts,
  lowAttendance,
  nextMark,
  overallStat,
  percentage,
  studentStats,
} from '../logic';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T10:00:00+05:30`) }) as never;
const st = (id: string, name: string, extra: Partial<Student> = {}): Student => ({
  id,
  name,
  phone: '',
  parentName: '',
  parentPhone: '+919876543210',
  class: '10',
  batchIds: ['b1'],
  status: 'active',
  monthlyFee: 0,
  feeCycle: 'monthly',
  dueDay: 1,
  notifyParent: true,
  joinedAt: ts('2026-01-01'),
  ...extra,
});
const doc = (
  date: string,
  marks: AttendanceDoc['marks'],
  extra: Partial<AttendanceDoc> = {},
): AttendanceDoc => ({ id: `b1_${date}`, batchId: 'b1', date, marks, ...extra });

describe('marks', () => {
  it('cycles P -> A -> L -> P', () => {
    expect(nextMark('P')).toBe('A');
    expect(nextMark('A')).toBe('L');
    expect(nextMark('L')).toBe('P');
  });
  it('counts', () => expect(counts(['P', 'P', 'A', 'L'])).toEqual({ P: 2, A: 1, L: 1 }));
});

describe('tapMark', () => {
  const none = { date: '2026-03-05', marks: {} };
  it('builds on the previous result, so rapid taps both count', () => {
    const once = tapMark(none, '2026-03-05', 's1', 'P');
    const twice = tapMark(once, '2026-03-05', 's1', 'P');
    expect(once.marks).toEqual({ s1: 'A' });
    expect(twice.marks).toEqual({ s1: 'L' });
  });
  it('starts from the saved mark, not always Present', () => {
    expect(tapMark(none, '2026-03-05', 's1', 'A').marks).toEqual({ s1: 'L' });
  });
  it('keeps other students edits', () => {
    const a = tapMark(none, '2026-03-05', 's1', 'P');
    expect(tapMark(a, '2026-03-05', 's2', 'P').marks).toEqual({ s1: 'A', s2: 'A' });
  });
  it('switching date discards edits from the other day', () => {
    const a = tapMark(none, '2026-03-05', 's1', 'P');
    expect(tapMark(a, '2026-03-06', 's2', 'P')).toEqual({ date: '2026-03-06', marks: { s2: 'A' } });
  });
});

describe('percentage', () => {
  it('late counts as attended', () => expect(percentage(6, 2, 2)).toBe(80));
  it('rounds to one decimal', () => expect(percentage(2, 0, 1)).toBe(66.7));
  it('is null with no data', () => expect(percentage(0, 0, 0)).toBeNull());
});

describe('buildRoster', () => {
  const all = [
    st('1', 'Asha'),
    st('2', 'Bala', { batchIds: ['b2'] }),
    st('3', 'Cee', { status: 'inactive' }),
    st('4', 'Dev', { joinedAt: ts('2026-03-10') }),
  ];
  it('defaults every active batch member to Present', () => {
    const r = buildRoster(all, 'b1', '2026-03-20');
    expect(r.map((x) => [x.student.id, x.mark])).toEqual([
      ['1', 'P'],
      ['4', 'P'],
    ]);
  });
  it('does not include a student on days before they joined', () => {
    expect(buildRoster(all, 'b1', '2026-03-05').map((x) => x.student.id)).toEqual(['1']);
  });
  it('shows saved marks, including students who later left or went inactive', () => {
    const r = buildRoster(all, 'b1', '2026-03-05', { '1': 'A', '3': 'L' });
    expect(r.map((x) => [x.student.id, x.mark])).toEqual([
      ['1', 'A'],
      ['3', 'L'],
    ]);
  });
  it('30 students open as all Present', () => {
    const many = Array.from({ length: 30 }, (_, i) => st(String(i), `S${i}`));
    const r = buildRoster(many, 'b1', '2026-03-20');
    expect(r).toHaveLength(30);
    expect(r.every((x) => x.mark === 'P')).toBe(true);
  });
});

describe('statistics', () => {
  const docs = [
    doc('2026-03-02', { '1': 'P', '2': 'A' }),
    doc('2026-03-03', { '1': 'L', '2': 'A' }),
    doc('2026-03-04', {}, { holiday: true, reason: 'holiday' }),
    doc('2026-03-05', { '1': 'P', '2': 'P', '3': 'A' }),
  ];
  it('ignores holidays and only counts days a student was marked', () => {
    const s = studentStats(docs);
    expect(s.get('1')).toMatchObject({ present: 2, late: 1, absent: 0, total: 3, pct: 100 });
    expect(s.get('2')).toMatchObject({ present: 1, absent: 2, total: 3, pct: 33.3 });
    expect(s.get('3')).toMatchObject({ total: 1, pct: 0 });
  });
  it('flags students below 75%, worst first, 75% itself is fine', () => {
    const s = studentStats([
      doc('2026-03-02', { a: 'P', b: 'P', c: 'A' }),
      doc('2026-03-03', { a: 'P', b: 'A', c: 'A' }),
      doc('2026-03-04', { a: 'P', b: 'P', c: 'P' }),
      doc('2026-03-05', { a: 'A', b: 'P', c: 'P' }),
    ]);
    expect(s.get('a')?.pct).toBe(75);
    expect(lowAttendance(s).map((x) => x.studentId)).toEqual(['c']);
  });
  it('overall counts sessions and holidays separately', () => {
    const o = overallStat(docs);
    expect(o).toMatchObject({ sessions: 3, holidays: 1, present: 3, late: 1, absent: 3 });
    expect(o.pct).toBe(57.1);
  });
  it('groups by batch', () => {
    const m = batchStats([
      ...docs,
      { id: 'b2_x', batchId: 'b2', date: '2026-03-02', marks: { z: 'P' } },
    ]);
    expect(m.get('b2')?.pct).toBe(100);
    expect(m.get('b1')?.sessions).toBe(3);
  });
});
