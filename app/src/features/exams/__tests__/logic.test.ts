import {
  gradeOf,
  parseMarks,
  percentOf,
  ranks,
  reportCardHtml,
  resultMessage,
  summary,
  toppersMessage,
  type CardLabels,
  type Result,
} from '../logic';

const t = (key: string, o: Record<string, unknown> = {}) =>
  `${key}${Object.entries(o)
    .map(([k, v]) => ` ${k}=${String(v)}`)
    .join('')}`;
const exam = {
  name: 'Unit test 1',
  subject: 'Maths',
  date: '2026-10-07',
  maxMarks: 50,
  batchName: '10A',
};
const results: Result[] = [
  { studentId: 'a', marks: 45, absent: false },
  { studentId: 'b', marks: 48, absent: false },
  { studentId: 'c', marks: 45, absent: false },
  { studentId: 'd', marks: 12, absent: false },
  { studentId: 'e', marks: null, absent: true },
  { studentId: 'f', marks: null, absent: false },
];

describe('tests and marks', () => {
  it('ranks like a merit list: ties share a rank, the next one skips, absent has none', () => {
    expect(Object.fromEntries(ranks(results))).toEqual({ b: 1, a: 2, c: 2, d: 4 });
  });

  it('works out percentages and CBSE grades', () => {
    expect(percentOf(42.5, 50)).toBe(85);
    expect([95, 85, 75, 65, 55, 45, 33, 32].map(gradeOf)).toEqual([
      'A1',
      'A2',
      'B1',
      'B2',
      'C1',
      'C2',
      'D',
      'E',
    ]);
  });

  it('sums up a test: who sat, average, top, bottom, passes', () => {
    expect(summary(results, 50, 35)).toEqual({
      sat: 4,
      absent: 1,
      average: 37.5,
      highest: 48,
      lowest: 12,
      passed: 3,
      failed: 1,
    });
    expect(summary([], 50, 35).average).toBeNull();
  });

  it('reads typed marks, refusing text and anything above the maximum', () => {
    expect(parseMarks('', 50)).toBeNull();
    expect(parseMarks(' 45 ', 50)).toBe(45);
    expect(parseMarks('45,5', 50)).toBe(45.5);
    expect(parseMarks('51', 50)).toBe('invalid');
    expect(parseMarks('4a', 50)).toBe('invalid');
    expect(parseMarks('1.234', 50)).toBe('invalid');
  });

  it("writes the parent's message with marks, grade, rank and average, or that the child was absent", () => {
    const base = {
      institute: 'Vidya',
      student: 'Asha',
      exam,
      dateText: '7 Oct',
      of: 4,
      average: 37.5,
    };
    const msg = resultMessage(t, { ...base, marks: 45, absent: false, rank: 2, remark: 'Good' });
    expect(msg).toContain('exams.msg.result');
    expect(msg).toContain('marks=45 max=50 percent=90 grade=A2');
    expect(msg).toContain('test=Unit test 1 (Maths)');
    expect(msg).toContain('exams.msg.rank rank=2 of=4');
    expect(msg).toContain('“Good”');
    expect(resultMessage(t, { ...base, marks: null, absent: true })).toContain('exams.msg.absent');
  });

  it('lists the top three for the group, ties included', () => {
    const names: Record<string, string> = { a: 'Asha', b: 'Bala', c: 'Chitra', d: 'Dev' };
    const msg = toppersMessage(t, exam, results, (id) => names[id] ?? '');
    expect(msg.split('\n')).toEqual([
      'Unit test 1 · Maths · 10A',
      'exams.msg.toppers',
      '🥇 Bala: 48/50',
      '🥈 Asha: 45/50',
      '🥈 Chitra: 45/50',
      'exams.msg.classAverage average=37.5 max=50',
      'exams.msg.wellDone',
    ]);
  });

  it('prints a report card with the overall percentage and escapes what people typed', () => {
    const L = Object.fromEntries(
      [
        'title',
        'student',
        'level',
        'date',
        'test',
        'subject',
        'marks',
        'percent',
        'grade',
        'rank',
        'absent',
        'overall',
        'testsTaken',
        'attendance',
        'remarks',
        'signature',
        'madeWith',
      ].map((k) => [k, k]),
    ) as CardLabels;
    const html = reportCardHtml({
      institute: 'Vidya <Tuition>',
      student: 'Asha',
      level: 'Class 10',
      periodText: 'Oct 2026',
      attendancePct: 92,
      L,
      rows: [
        {
          name: 'UT1',
          subject: 'Maths',
          dateText: '7 Oct',
          maxMarks: 50,
          marks: 45,
          absent: false,
          rank: 2,
          of: 4,
          remark: 'Keep it up',
        },
        {
          name: 'UT2',
          subject: 'Science',
          dateText: '14 Oct',
          maxMarks: 50,
          marks: 35,
          absent: false,
          rank: 1,
          of: 4,
          remark: '',
        },
        {
          name: 'UT3',
          subject: 'English',
          dateText: '21 Oct',
          maxMarks: 25,
          marks: null,
          absent: true,
          rank: null,
          of: 3,
          remark: '',
        },
      ],
    });
    expect(html).toContain('Vidya &lt;Tuition&gt;');
    expect(html).toContain('80% · B1'); // (45 + 35) / 100
    expect(html).toContain('2 / 3');
    expect(html).toContain('92%');
    expect(html).toContain('UT1: Keep it up');
  });
});
