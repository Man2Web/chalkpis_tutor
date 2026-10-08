import {
  Timestamp,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';
import { db } from '../../lib/firebase';
import { currentPeriodIst } from './period';
import type { FeeCycle, PayMode } from '../../lib/types';
import {
  applyPayment,
  applyReversal,
  discountError,
  formatReceiptNo,
  netDue,
  statusFor,
} from './logic';

export type FeeApiError =
  'amount' | 'exceeds' | 'waived' | 'notFound' | 'alreadyReversed' | 'notReversible' | 'tooBig';

const fail = (e: FeeApiError): never => {
  throw new Error(e);
};

const dueRef = (i: string, id: string) => doc(db, 'institutes', i, 'feeDues', id);
const payRef = (i: string, id: string) => doc(db, 'institutes', i, 'payments', id);

/** yyyy-mm-dd -> Timestamp. Today keeps the real time; other days are noon Indian time. */
export function paidAtFor(ymd: string, today: string): Timestamp {
  return ymd === today ? Timestamp.now() : Timestamp.fromDate(new Date(`${ymd}T12:00:00+05:30`));
}

export interface RecordPayment {
  instituteId: string;
  uid: string;
  dueId: string;
  amount: number; // paise
  mode: PayMode;
  paidAt: Timestamp;
  note?: string;
}

/**
 * Records a payment: allocates the next receipt number, writes the (append-only) payment and updates
 * the due, all in one transaction so two devices can never share a receipt number or overpay.
 */
export function recordPayment(p: RecordPayment): Promise<{ paymentId: string; receiptNo: string }> {
  const instRef = doc(db, 'institutes', p.instituteId);
  return runTransaction(db, async (tx) => {
    const [dueSnap, instSnap] = await Promise.all([
      tx.get(dueRef(p.instituteId, p.dueId)),
      tx.get(instRef),
    ]);
    if (!dueSnap.exists()) return fail('notFound');
    const due = dueSnap.data() as {
      studentId: string;
      amount: number;
      discount: number;
      paid: number;
      status: 'pending' | 'partial' | 'paid' | 'waived';
    };
    const result = applyPayment(due, p.amount);
    if ('error' in result) return fail(result.error);

    const inst = instSnap.data() ?? {};
    const seq: number = inst.nextReceiptNo ?? 1;
    const receiptNo = formatReceiptNo(inst.receiptPrefix ?? 'TD', seq);
    const ref = doc(collection(db, 'institutes', p.instituteId, 'payments'));
    const now = serverTimestamp();

    tx.set(ref, {
      studentId: due.studentId,
      dueId: p.dueId,
      amount: p.amount,
      mode: p.mode,
      paidAt: p.paidAt,
      receiptNo,
      receiptUrl: null,
      note: p.note ?? '',
      recordedBy: p.uid,
      balanceAfter: Math.max(0, netDue(due) - result.paid),
      createdAt: now,
      updatedAt: now,
    });
    tx.update(dueRef(p.instituteId, p.dueId), {
      paid: result.paid,
      status: result.status,
      updatedAt: now,
    });
    tx.update(instRef, { nextReceiptNo: seq + 1, updatedAt: now });
    return { paymentId: ref.id, receiptNo };
  });
}

/**
 * Corrects a payment with a reversing (negative) entry. The id is fixed per payment, so a payment can be
 * reversed at most once even if two devices try at the same time.
 */
export function reversePayment(a: { instituteId: string; uid: string; paymentId: string }) {
  return runTransaction(db, async (tx) => {
    const revRef = payRef(a.instituteId, `rev_${a.paymentId}`);
    const [paySnap, revSnap] = await Promise.all([
      tx.get(payRef(a.instituteId, a.paymentId)),
      tx.get(revRef),
    ]);
    if (!paySnap.exists()) return fail('notFound');
    if (revSnap.exists()) return fail('alreadyReversed');
    const pay = paySnap.data() as {
      studentId: string;
      dueId: string;
      amount: number;
      mode: PayMode;
    };
    if (pay.amount <= 0) return fail('notReversible');

    const dRef = dueRef(a.instituteId, pay.dueId);
    const dueSnap = await tx.get(dRef);
    if (!dueSnap.exists()) return fail('notFound');
    const due = dueSnap.data() as {
      amount: number;
      discount: number;
      paid: number;
      status: 'pending' | 'partial' | 'paid' | 'waived';
    };
    const r = applyReversal(due, pay.amount);
    const now = serverTimestamp();

    tx.set(revRef, {
      studentId: pay.studentId,
      dueId: pay.dueId,
      amount: -pay.amount,
      mode: pay.mode,
      paidAt: Timestamp.now(),
      receiptNo: null,
      receiptUrl: null,
      note: '',
      recordedBy: a.uid,
      reversalOf: a.paymentId,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(dRef, { paid: r.paid, status: r.status, updatedAt: now });
  });
}

/** One-off charge (admission, books...) as its own due. */
export async function addCharge(a: {
  instituteId: string;
  studentId: string;
  description: string;
  amount: number;
  dueYmd: string;
}) {
  if (!Number.isInteger(a.amount) || a.amount <= 0) fail('amount');
  const id = `${a.studentId}_x${Date.now().toString(36)}`;
  await setDoc(dueRef(a.instituteId, id), {
    studentId: a.studentId,
    batchId: null,
    period: currentPeriodIst(),
    amount: a.amount,
    discount: 0,
    paid: 0,
    status: 'pending',
    dueDate: Timestamp.fromDate(new Date(`${a.dueYmd}T00:00:00+05:30`)),
    description: a.description.trim(),
    kind: 'charge',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return id;
}

export async function setDiscount(a: {
  instituteId: string;
  due: { id: string; amount: number; paid: number; status: string };
  discount: number;
}) {
  const err = discountError(a.due, a.discount);
  if (err) fail(err === 'amount' ? 'amount' : 'tooBig');
  await updateDoc(dueRef(a.instituteId, a.due.id), {
    discount: a.discount,
    status: statusFor(a.due.amount, a.discount, a.due.paid, a.due.status === 'waived'),
    updatedAt: serverTimestamp(),
  });
}

/** Waive forgives the remaining balance; restoring recomputes from the money. */
export async function setWaived(a: {
  instituteId: string;
  due: { id: string; amount: number; discount: number; paid: number };
  waived: boolean;
  note?: string;
}) {
  await updateDoc(dueRef(a.instituteId, a.due.id), {
    status: statusFor(a.due.amount, a.due.discount, a.due.paid, a.waived),
    waivedNote: a.waived ? (a.note ?? '') : '',
    updatedAt: serverTimestamp(),
  });
}

/** Applies from the next generated due; existing dues are not changed. */
export function updateFeePlan(a: {
  instituteId: string;
  studentId: string;
  monthlyFee: number;
  feeCycle: FeeCycle;
  dueDay: number;
  discount: number;
}) {
  return updateDoc(doc(db, 'institutes', a.instituteId, 'students', a.studentId), {
    monthlyFee: a.monthlyFee,
    feeCycle: a.feeCycle,
    dueDay: a.dueDay,
    discount: a.discount,
    updatedAt: serverTimestamp(),
  });
}
