import type { DueStatus, FeeDue, Payment } from '../../lib/types';

type DueMoney = Pick<FeeDue, 'amount' | 'discount' | 'paid' | 'status'>;

/** What the student owes for this due after discount. */
export const netDue = (d: Pick<FeeDue, 'amount' | 'discount'>) =>
  Math.max(0, d.amount - d.discount);

/** Still to be paid, in paise. Waived dues owe nothing. */
export const outstanding = (d: DueMoney) =>
  d.status === 'waived' ? 0 : Math.max(0, netDue(d) - d.paid);

export function statusFor(
  amount: number,
  discount: number,
  paid: number,
  waived = false,
): DueStatus {
  if (waived) return 'waived';
  const net = Math.max(0, amount - discount);
  if (paid >= net) return 'paid';
  return paid > 0 ? 'partial' : 'pending';
}

export type FeeError = 'amount' | 'exceeds' | 'waived';

/** Result of recording a payment against a due, or why it is not allowed. */
export function applyPayment(
  due: DueMoney,
  amount: number,
): { paid: number; status: DueStatus } | { error: FeeError } {
  if (!Number.isInteger(amount) || amount <= 0) return { error: 'amount' };
  if (due.status === 'waived') return { error: 'waived' };
  if (amount > outstanding(due)) return { error: 'exceeds' };
  const paid = due.paid + amount;
  return { paid, status: statusFor(due.amount, due.discount, paid) };
}

/** Result of reversing a payment of `amount` (positive) on a due. */
export function applyReversal(due: DueMoney, amount: number): { paid: number; status: DueStatus } {
  const paid = Math.max(0, due.paid - amount);
  return { paid, status: statusFor(due.amount, due.discount, paid, due.status === 'waived') };
}

/** A discount may not push the net amount below what has already been paid. */
export const discountError = (
  due: Pick<FeeDue, 'amount' | 'paid'>,
  discount: number,
): 'amount' | 'tooBig' | null => {
  if (!Number.isInteger(discount) || discount < 0) return 'amount';
  return discount > due.amount || due.amount - discount < due.paid ? 'tooBig' : null;
};

export const isOverdue = (d: DueMoney & { dueDate: string }, today: string) =>
  outstanding(d) > 0 && d.dueDate < today;

export interface StudentDues {
  studentId: string;
  outstanding: number;
  overdueAmount: number;
  oldestDueDate: string; // yyyy-mm-dd
  dueIds: string[];
  overdue: boolean;
}

/** Unpaid dues grouped per student. `dueYmd` converts a due to its yyyy-mm-dd due date. */
export function groupByStudent(
  dues: FeeDue[],
  today: string,
  dueYmd: (d: FeeDue) => string,
): StudentDues[] {
  const map = new Map<string, StudentDues>();
  for (const d of dues) {
    const owe = outstanding(d);
    if (owe <= 0) continue;
    const ymd = dueYmd(d);
    const g = map.get(d.studentId) ?? {
      studentId: d.studentId,
      outstanding: 0,
      overdueAmount: 0,
      oldestDueDate: ymd,
      dueIds: [],
      overdue: false,
    };
    g.outstanding += owe;
    if (ymd < today) {
      g.overdueAmount += owe;
      g.overdue = true;
    }
    if (ymd < g.oldestDueDate) g.oldestDueDate = ymd;
    g.dueIds.push(d.id);
    map.set(d.studentId, g);
  }
  // Overdue first, then oldest due date, then biggest amount.
  return [...map.values()].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      a.oldestDueDate.localeCompare(b.oldestDueDate) ||
      b.outstanding - a.outstanding,
  );
}

export function totals(groups: StudentDues[]) {
  return {
    outstanding: groups.reduce((s, g) => s + g.outstanding, 0),
    overdueAmount: groups.reduce((s, g) => s + g.overdueAmount, 0),
    students: groups.length,
    overdueStudents: groups.filter((g) => g.overdue).length,
  };
}

export const formatReceiptNo = (prefix: string, n: number) =>
  `${prefix || 'RC'}-${String(n).padStart(5, '0')}`;

/** Payments that already have a reversing entry (the ledger is append-only, so we derive this). */
export const reversedIds = (payments: Pick<Payment, 'reversalOf'>[]) =>
  new Set(payments.map((p) => p.reversalOf).filter((x): x is string => !!x));

/** Net collected from a list of payments (reversals are negative). */
export const netCollected = (payments: Pick<Payment, 'amount'>[]) =>
  payments.reduce((s, p) => s + p.amount, 0);

/** "Mar 2026" from "2026-03". */
export function periodLabel(period: string, locale = 'en-IN'): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Mar 2026", or "Feb 2026 – Apr 2026" for several different months; '' for none. */
export function periodSpan(periods: string[], locale = 'en-IN'): string {
  const sorted = [...new Set(periods)].sort();
  if (sorted.length === 0) return '';
  const first = periodLabel(sorted[0], locale);
  return sorted.length === 1
    ? first
    : `${first} – ${periodLabel(sorted[sorted.length - 1], locale)}`;
}
