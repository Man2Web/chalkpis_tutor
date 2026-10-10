import type { AttendanceDoc, FeeDue, Payment } from '../../../lib/types';
import {
  attendanceTrend,
  collectionReport,
  feeStatusRows,
  reportCsvRows,
  reportHtml,
  type ReportData,
  type ReportLabels,
} from '../logic';
import { parseCsv, toCsv } from '../../../lib/csv';

const due = (id: string, extra: Partial<FeeDue> = {}) =>
  ({
    id,
    studentId: id,
    period: '2026-10',
    amount: 100000,
    discount: 0,
    paid: 0,
    status: 'pending',
    description: '',
    dueDate: {} as never,
    ...extra,
  }) as FeeDue;
const pay = (amount: number, mode: Payment['mode'], batchId?: string | null) =>
  ({ id: 'p', amount, mode, batchId }) as unknown as Payment;
const doc = (
  date: string,
  marks: AttendanceDoc['marks'],
  batchId = 'b1',
  extra: Partial<AttendanceDoc> = {},
): AttendanceDoc => ({ id: `${batchId}_${date}`, batchId, date, marks, ...extra });

describe('collectionReport', () => {
  const dues = [
    due('a', { paid: 100000, status: 'paid' }),
    due('b', { paid: 40000, status: 'partial', discount: 20000 }),
    due('c'),
    due('d', { status: 'waived', paid: 10000 }),
  ];
  const payments = [
    pay(100000, 'cash', 'b1'),
    pay(40000, 'upi', 'b1'),
    pay(25000, 'upi', 'b2'),
    pay(-25000, 'upi', 'b2'),
    pay(5000, 'bank', null),
  ];
  const r = collectionReport(dues, payments);

  it('billed is net of discounts; pending excludes paid and waived', () => {
    expect(r.billed).toBe(100000 + 80000 + 100000 + 100000);
    expect(r.pending).toBe(40000 + 100000);
  });
  it('waived is what was forgiven', () => expect(r.waived).toBe(90000));
  it('collected is net of reversals and independent of which month the dues are', () =>
    expect(r.collected).toBe(145000));
  it('splits by mode (reversals net out)', () =>
    expect(r.byMode).toEqual({ cash: 100000, upi: 40000, bank: 5000, other: 0 }));
  it('splits by batch, largest first, unassigned as null', () => {
    expect(r.byBatch).toEqual([
      { batchId: 'b1', amount: 140000 },
      { batchId: null, amount: 5000 },
      { batchId: 'b2', amount: 0 },
    ]);
  });
  it('empty month is all zeros', () => {
    expect(collectionReport([], [])).toMatchObject({
      billed: 0,
      collected: 0,
      pending: 0,
      waived: 0,
      byBatch: [],
    });
  });
});

describe('attendanceTrend', () => {
  it('averages across batches per day, skips holidays, sorted by date', () => {
    const t = attendanceTrend([
      doc('2026-10-03', { a: 'P', b: 'A' }),
      doc('2026-10-02', { a: 'P', b: 'P', c: 'L', d: 'A' }),
      doc('2026-10-02', { z: 'A' }, 'b2'),
      doc('2026-10-04', {}, 'b1', { holiday: true }),
      doc('2026-10-05', {}),
    ]);
    expect(t).toEqual([
      { date: '2026-10-02', present: 3, total: 5, pct: 60 },
      { date: '2026-10-03', present: 1, total: 2, pct: 50 },
    ]);
  });
});

describe('exports', () => {
  const data: ReportData = {
    month: '2026-10',
    institute: 'Sunrise, "Classes"',
    collection: collectionReport([due('a')], [pay(150000, 'cash', 'b1')]),
    batches: [{ id: 'b1', name: 'Maths 10' }],
    students: [
      {
        name: 'Asha <b>Rao</b>',
        className: '10',
        stat: { present: 3, late: 1, absent: 1, total: 5, pct: 80 },
      },
    ],
    attendancePct: 80,
    sessions: 5,
  };

  it('csv has the numbers in rupees, survives commas and quotes, and round-trips', () => {
    const rows = reportCsvRows(data);
    const text = toCsv(rows);
    expect(text).toContain('Collected this month,1500.00');
    expect(text).toContain('Maths 10,1500.00');
    const back = parseCsv(text);
    expect(back[0]).toEqual(['Report', '2026-10', 'Sunrise, "Classes"']);
    expect(back.find((r) => r[0] === 'Asha <b>Rao</b>')).toEqual([
      'Asha <b>Rao</b>',
      '10',
      '3',
      '1',
      '1',
      '80',
    ]);
  });

  const L: ReportLabels = {
    title: 'Monthly report',
    collection: 'Collection',
    billed: 'Billed',
    collected: 'Collected',
    pending: 'Pending',
    waived: 'Waived',
    byMode: 'By mode',
    byBatch: 'By batch',
    attendance: 'Attendance',
    average: 'Average',
    classes: 'Classes',
    student: 'Student',
    present: 'P',
    late: 'L',
    absent: 'A',
    percent: '%',
    noBatch: 'No batch',
  };
  it('html contains the figures and escapes user text', () => {
    const h = reportHtml(
      data,
      L,
      (p) => `₹${p / 100}`,
      (m) => m.toUpperCase(),
      'Oct 2026',
    );
    expect(h).toContain('₹1500');
    expect(h).toContain('Maths 10');
    expect(h).toContain('CASH');
    expect(h).toContain('Oct 2026');
    expect(h).not.toContain('<b>Rao</b>');
    expect(h).toContain('Asha &lt;b&gt;Rao&lt;/b&gt;');
    expect(h).toContain('Sunrise, &quot;Classes&quot;');
  });
});

describe('feeStatusRows', () => {
  const students = [
    { id: 'a', name: 'Asha', class: '9' },
    { id: 'b', name: 'Bala', class: '10' },
    { id: 'c', name: 'Chitra' },
    { id: 'd', name: 'Dev' },
  ];
  const rows = feeStatusRows(
    [
      due('d', { paid: 100000, status: 'paid' }),
      due('c', { paid: 40000, status: 'partial' }),
      due('b'),
      due('a', { status: 'waived' }),
      due('zz'),
    ],
    students,
  );
  it('lists unpaid first, then part paid, waived and paid, by name inside each', () => {
    expect(rows.map((r) => [r.student, r.status])).toEqual([
      ['—', 'Unpaid'],
      ['Bala', 'Unpaid'],
      ['Chitra', 'Part paid'],
      ['Asha', 'Waived'],
      ['Dev', 'Paid'],
    ]);
  });
  it('goes into the spreadsheet with money as numbers when asked', () => {
    const data = {
      month: '2026-10',
      institute: 'X',
      collection: collectionReport([], []),
      batches: [],
      students: [],
      fees: rows,
      attendancePct: null,
      sessions: 0,
    } as ReportData;
    const sheet = reportCsvRows(data, true);
    expect(sheet).toContainEqual(['Chitra', '', '', 1000, 400, 600, 'Part paid']);
    expect(reportCsvRows(data)).toContainEqual([
      'Chitra',
      '',
      '',
      '1000.00',
      '400.00',
      '600.00',
      'Part paid',
    ]);
  });
});
