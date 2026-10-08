import type { FeeDue } from '../../../lib/types';
import {
  applyPayment,
  applyReversal,
  discountError,
  formatReceiptNo,
  groupByStudent,
  isOverdue,
  netCollected,
  netDue,
  outstanding,
  periodLabel,
  periodSpan,
  reversedIds,
  statusFor,
  totals,
} from '../logic';

const due = (extra: Partial<FeeDue> = {}): FeeDue => ({
  id: 's1_2026-03',
  studentId: 's1',
  period: '2026-03',
  amount: 150000,
  discount: 0,
  paid: 0,
  status: 'pending',
  dueDate: {} as never,
  description: 'Monthly fee',
  ...extra,
});
const ymdOf = (d: FeeDue) => (d as unknown as { ymd: string }).ymd;
const withYmd = (ymd: string, extra: Partial<FeeDue> = {}) => ({ ...due(extra), ymd }) as FeeDue;

describe('acceptance: fee 1,500 with 1,000 paid', () => {
  it('leaves 500 pending and the receipt is for 1,000', () => {
    const r = applyPayment(due(), 100000);
    expect(r).toEqual({ paid: 100000, status: 'partial' });
    expect(outstanding(due({ paid: 100000, status: 'partial' }))).toBe(50000);
  });
  it('paying the rest completes the due', () => {
    const r = applyPayment(due({ paid: 100000, status: 'partial' }), 50000);
    expect(r).toEqual({ paid: 150000, status: 'paid' });
  });
});

describe('amounts', () => {
  it('discount reduces what is owed', () => {
    expect(netDue(due({ discount: 20000 }))).toBe(130000);
    expect(outstanding(due({ discount: 20000, paid: 30000 }))).toBe(100000);
  });
  it('waived owes nothing even if unpaid', () =>
    expect(outstanding(due({ status: 'waived' }))).toBe(0));
  it('status follows the money', () => {
    expect(statusFor(150000, 0, 0)).toBe('pending');
    expect(statusFor(150000, 0, 1)).toBe('partial');
    expect(statusFor(150000, 0, 150000)).toBe('paid');
    expect(statusFor(150000, 150000, 0)).toBe('paid'); // 100% discount
    expect(statusFor(150000, 0, 0, true)).toBe('waived');
  });
});

describe('applyPayment validation', () => {
  it.each([0, -5, 10.5, NaN])('rejects %s', (a) =>
    expect(applyPayment(due(), a)).toEqual({ error: 'amount' }),
  );
  it('cannot overpay', () =>
    expect(applyPayment(due({ paid: 100000, status: 'partial' }), 50001)).toEqual({
      error: 'exceeds',
    }));
  it('cannot pay a waived due', () =>
    expect(applyPayment(due({ status: 'waived' }), 100)).toEqual({ error: 'waived' }));
  it('cannot pay an already paid due', () =>
    expect(applyPayment(due({ paid: 150000, status: 'paid' }), 100)).toEqual({ error: 'exceeds' }));
});

describe('reversal', () => {
  it('puts the money back and recomputes status', () => {
    expect(applyReversal(due({ paid: 150000, status: 'paid' }), 100000)).toEqual({
      paid: 50000,
      status: 'partial',
    });
    expect(applyReversal(due({ paid: 100000, status: 'partial' }), 100000)).toEqual({
      paid: 0,
      status: 'pending',
    });
  });
  it('never goes below zero and keeps waived', () => {
    expect(applyReversal(due({ paid: 10, status: 'partial' }), 999).paid).toBe(0);
    expect(applyReversal(due({ paid: 10, status: 'waived' }), 10).status).toBe('waived');
  });
  it('derives which payments are reversed and nets the totals', () => {
    const list = [
      { id: 'p1', amount: 1000 },
      { id: 'rev_p1', amount: -1000, reversalOf: 'p1' },
      { id: 'p2', amount: 500 },
    ];
    expect([...reversedIds(list)]).toEqual(['p1']);
    expect(netCollected(list)).toBe(500);
  });
});

describe('discountError', () => {
  it('allows a normal discount', () =>
    expect(discountError({ amount: 150000, paid: 0 }, 20000)).toBeNull());
  it('rejects negative / fractional', () => {
    expect(discountError({ amount: 150000, paid: 0 }, -1)).toBe('amount');
    expect(discountError({ amount: 150000, paid: 0 }, 1.5)).toBe('amount');
  });
  it('rejects more than the amount, or below what is already paid', () => {
    expect(discountError({ amount: 150000, paid: 0 }, 150001)).toBe('tooBig');
    expect(discountError({ amount: 150000, paid: 100000 }, 60000)).toBe('tooBig');
    expect(discountError({ amount: 150000, paid: 100000 }, 50000)).toBeNull();
  });
});

describe('overdue and grouping', () => {
  const today = '2026-03-20';
  it('overdue only when unpaid and past the due date', () => {
    expect(isOverdue({ ...due(), dueDate: '2026-03-05' }, today)).toBe(true);
    expect(isOverdue({ ...due(), dueDate: '2026-03-20' }, today)).toBe(false); // due today is not overdue yet
    expect(
      isOverdue({ ...due({ paid: 150000, status: 'paid' }), dueDate: '2026-03-05' }, today),
    ).toBe(false);
  });
  it('groups per student, overdue first, and totals add up', () => {
    const dues = [
      withYmd('2026-03-25', { id: 'a_1', studentId: 'a' }),
      withYmd('2026-02-05', { id: 'b_1', studentId: 'b', amount: 100000 }),
      withYmd('2026-03-05', {
        id: 'b_2',
        studentId: 'b',
        amount: 100000,
        paid: 40000,
        status: 'partial',
      }),
      withYmd('2026-01-05', { id: 'c_1', studentId: 'c', status: 'paid', paid: 150000 }),
      withYmd('2026-01-05', { id: 'd_1', studentId: 'd', status: 'waived' }),
    ];
    const g = groupByStudent(dues, today, ymdOf);
    expect(g.map((x) => x.studentId)).toEqual(['b', 'a']);
    expect(g[0]).toMatchObject({
      outstanding: 160000,
      overdueAmount: 160000,
      oldestDueDate: '2026-02-05',
      overdue: true,
    });
    expect(g[1]).toMatchObject({ outstanding: 150000, overdueAmount: 0, overdue: false });
    expect(totals(g)).toEqual({
      outstanding: 310000,
      overdueAmount: 160000,
      students: 2,
      overdueStudents: 1,
    });
  });
});

describe('formatting', () => {
  it('receipt numbers', () => {
    expect(formatReceiptNo('TD', 1)).toBe('TD-00001');
    expect(formatReceiptNo('', 123456)).toBe('RC-123456');
  });
  it('period label', () => expect(periodLabel('2026-03')).toBe('Mar 2026'));
  it('period span collapses repeats and spans months', () => {
    expect(periodSpan(['2026-10', '2026-10'])).toBe('Oct 2026');
    expect(periodSpan(['2026-10', '2026-08', '2026-09'])).toBe('Aug 2026 – Oct 2026');
    expect(periodSpan([])).toBe('');
  });
});
