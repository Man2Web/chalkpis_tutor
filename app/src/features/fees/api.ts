import { api, ApiError } from '../../api/client';
import type { FeeCycle, PayMode } from '../../lib/types';

export type FeeApiError =
  'amount' | 'exceeds' | 'waived' | 'notFound' | 'alreadyReversed' | 'notReversible' | 'tooBig';

/** The server's short reasons, in the words the screens already translate. Anything else stays an ApiError. */
const MAP: Record<string, FeeApiError> = {
  bad_amount: 'amount',
  bad_request: 'amount',
  exceeds_balance: 'exceeds',
  due_waived: 'waived',
  not_found: 'notFound',
  already_reversed: 'alreadyReversed',
  not_reversible: 'notReversible',
  discount_too_big: 'tooBig',
};

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError && MAP[e.code]) throw new Error(MAP[e.code]);
    throw e;
  }
}

export interface RecordPayment {
  instituteId: string;
  uid: string;
  dueId: string;
  amount: number; // paise
  mode: PayMode;
  /** The day the money was received (yyyy-mm-dd, Indian time); today when omitted. */
  paidOn?: string;
  note?: string;
}

/** Records a payment. The server takes the next receipt number and checks the balance in one step, so two phones can never clash. */
export function recordPayment(p: RecordPayment): Promise<{ paymentId: string; receiptNo: string }> {
  return run(() =>
    api<{ paymentId: string; receiptNo: string }>('POST', `/fees/dues/${p.dueId}/payments`, {
      amount: p.amount,
      mode: p.mode,
      ...(p.paidOn ? { paidOn: p.paidOn } : {}),
      note: p.note ?? '',
    }),
  );
}

/** Corrects a payment with a reversing (negative) entry; a payment can be reversed once. */
export async function reversePayment(a: { instituteId: string; uid: string; paymentId: string }) {
  await run(() => api('POST', `/fees/payments/${a.paymentId}/reverse`));
}

/** One-off charge (admission, books...) as its own due. */
export async function addCharge(a: {
  instituteId: string;
  studentId: string;
  description: string;
  amount: number;
  dueYmd: string;
}) {
  if (!Number.isInteger(a.amount) || a.amount <= 0) throw new Error('amount');
  const r = await run(() =>
    api<{ id: string }>('POST', '/fees/charges', {
      studentId: a.studentId,
      description: a.description.trim(),
      amount: a.amount,
      dueDate: a.dueYmd,
    }),
  );
  return r.id;
}

export async function setDiscount(a: {
  instituteId: string;
  due: { id: string };
  discount: number;
}) {
  await run(() => api('PATCH', `/fees/dues/${a.due.id}/discount`, { discount: a.discount }));
}

/** Waive forgives the remaining balance; restoring recomputes from the money. */
export async function setWaived(a: {
  instituteId: string;
  due: { id: string };
  waived: boolean;
  note?: string;
}) {
  await run(() =>
    api('POST', `/fees/dues/${a.due.id}/waive`, { waived: a.waived, note: a.note ?? '' }),
  );
}

/** Applies from the next generated due; existing dues are not changed. */
export async function updateFeePlan(a: {
  instituteId: string;
  studentId: string;
  monthlyFee: number;
  feeCycle: FeeCycle;
  dueDay: number;
  discount: number;
}) {
  await api('PATCH', `/students/${a.studentId}`, {
    monthlyFee: a.monthlyFee,
    feeCycle: a.feeCycle,
    dueDay: a.dueDay,
    discount: a.discount,
  });
}
