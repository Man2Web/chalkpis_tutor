/** Pure fee rules (money in integer paise). Same rules the app and the old Firebase functions used. */
export type FeeCycle = 'monthly' | 'quarterly' | 'one-time';
export type DueStatus = 'pending' | 'partial' | 'paid' | 'waived';
export interface DueMoney {
  amount: number;
  discount: number;
  paid: number;
  status: DueStatus;
}

export const netDue = (d: Pick<DueMoney, 'amount' | 'discount'>) =>
  Math.max(0, d.amount - d.discount);

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

export type PayError = 'amount' | 'exceeds' | 'waived';

export function applyPayment(
  due: DueMoney,
  amount: number,
): { paid: number; status: DueStatus } | { error: PayError } {
  if (!Number.isInteger(amount) || amount <= 0) return { error: 'amount' };
  if (due.status === 'waived') return { error: 'waived' };
  if (amount > outstanding(due)) return { error: 'exceeds' };
  const paid = due.paid + amount;
  return { paid, status: statusFor(due.amount, due.discount, paid) };
}

export function applyReversal(due: DueMoney, amount: number): { paid: number; status: DueStatus } {
  const paid = Math.max(0, due.paid - amount);
  return { paid, status: statusFor(due.amount, due.discount, paid, due.status === 'waived') };
}

/** A discount may not push the net amount below what has already been paid. */
export const discountError = (
  due: Pick<DueMoney, 'amount' | 'paid'>,
  discount: number,
): 'amount' | 'too_big' | null => {
  if (!Number.isInteger(discount) || discount < 0) return 'amount';
  return discount > due.amount || due.amount - discount < due.paid ? 'too_big' : null;
};

export const formatReceiptNo = (prefix: string, n: number) =>
  `${prefix || 'RC'}-${String(n).padStart(5, '0')}`;

const monthNumber = (period: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return y * 12 + (m - 1);
};

/** Is a regular due created for a student who joined in `joinedPeriod`, for `period`? */
export function isDueInPeriod(feeCycle: FeeCycle, joinedPeriod: string, period: string): boolean {
  const diff = monthNumber(period) - monthNumber(joinedPeriod);
  if (diff < 0) return false;
  if (feeCycle === 'one-time') return diff === 0;
  if (feeCycle === 'quarterly') return diff % 3 === 0;
  return true;
}

/** yyyy-mm-dd with dueDay clamped to the month length (31 -> 28/30 when needed). */
export function dueDateFor(period: string, dueDay: number): string {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Math.min(Math.max(1, Math.floor(dueDay) || 1), last);
  return `${period}-${String(day).padStart(2, '0')}`;
}

export const descriptionFor = (c: FeeCycle) =>
  c === 'quarterly' ? 'Quarterly fee' : c === 'one-time' ? 'One-time fee' : 'Monthly fee';
