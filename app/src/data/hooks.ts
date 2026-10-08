import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from '@react-native-firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../features/auth/session';
import { attendanceId, firstOfMonth, todayYmd } from '../lib/dates';
import { db } from '../lib/firebase';
import type { AttendanceDoc, Batch, FeeDue, Payment, Student } from '../lib/types';

/** The signed-in owner's institute. Only call inside the main app (status === 'ready'). */
export function useInstituteId(): string {
  return useSession((s) => s.profile?.instituteId) as string;
}

const col = (instituteId: string, name: string) => collection(db, 'institutes', instituteId, name);

export function useBatches() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['batches', id],
    queryFn: async (): Promise<Batch[]> => {
      const snap = await getDocs(query(col(id, 'batches'), orderBy('name')));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Batch, 'id'>) }));
    },
  });
}

export function useStudents() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['students', id],
    queryFn: async (): Promise<Student[]> => {
      const snap = await getDocs(query(col(id, 'students'), orderBy('name')));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Student, 'id'>) }));
    },
  });
}

export interface Limits {
  studentLimit: number | null;
  batchLimit: number | null;
  activeStudentCount: number;
  batchCount: number;
  plan: string;
  active: boolean;
}

export function useLimits() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['limits', id],
    queryFn: async (): Promise<Limits> => {
      const [sub, stats] = await Promise.all([
        getDoc(doc(db, 'institutes', id, 'subscription', 'current')),
        getDoc(doc(db, 'institutes', id, 'counters', 'stats')),
      ]);
      const s = sub.data();
      const c = stats.data();
      const expires: number = s?.expiresAt?.toMillis?.() ?? 0;
      return {
        studentLimit: s?.studentLimit ?? null,
        batchLimit: s?.batchLimit ?? null,
        activeStudentCount: c?.activeStudentCount ?? 0,
        batchCount: c?.batchCount ?? 0,
        plan: s?.plan ?? 'trial',
        active: s?.status === 'active' && expires > Date.now(),
      };
    },
  });
}

/** Ids of students with an unpaid or part-paid due. */
export function usePendingStudentIds() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['pendingDues', id],
    queryFn: async (): Promise<Set<string>> => {
      const snap = await getDocs(
        query(col(id, 'feeDues'), where('status', 'in', ['pending', 'partial'])),
      );
      return new Set(snap.docs.map((d) => d.data().studentId as string));
    },
  });
}

/** Call after writes so every list and total for this institute refreshes. */
export function useRefreshData() {
  const qc = useQueryClient();
  const id = useInstituteId();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === id });
}

const toAttendance = (d: { id: string; data: () => unknown }) => ({
  id: d.id,
  ...(d.data() as Omit<AttendanceDoc, 'id'>),
});

/** Every batch's attendance document for one day (used for the "marked / not marked" status). */
export function useAttendanceOn(date: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['attendance', id, 'on', date],
    queryFn: async (): Promise<AttendanceDoc[]> => {
      const snap = await getDocs(query(col(id, 'attendance'), where('date', '==', date)));
      return snap.docs.map(toAttendance);
    },
  });
}

/** One batch's saved attendance for one day, or null. Also returns createdAt so a re-save keeps it. */
export function useAttendanceDoc(batchId: string, date: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['attendance', id, 'doc', batchId, date],
    queryFn: async () => {
      const snap = await getDoc(
        doc(db, 'institutes', id, 'attendance', attendanceId(batchId, date)),
      );
      if (!snap.exists()) return null;
      const data = snap.data() as Omit<AttendanceDoc, 'id'> & { createdAt?: unknown };
      return { id: snap.id, ...data };
    },
  });
}

/** Attendance documents in a date range (inclusive), optionally for one batch. */
export function useAttendanceRange(from: string, to: string, batchId?: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['attendance', id, 'range', from, to, batchId ?? 'all'],
    queryFn: async (): Promise<AttendanceDoc[]> => {
      // orderBy date DESC matches the (batchId, date desc) composite index.
      const filters = [where('date', '>=', from), where('date', '<=', to)];
      const q = batchId
        ? query(
            col(id, 'attendance'),
            where('batchId', '==', batchId),
            ...filters,
            orderBy('date', 'desc'),
          )
        : query(col(id, 'attendance'), ...filters, orderBy('date', 'desc'));
      return (await getDocs(q)).docs.map(toAttendance);
    },
  });
}

export interface Institute {
  name: string;
  logoUrl?: string | null;
  address?: string;
  phone?: string;
  receiptPrefix: string;
}

export function useInstitute() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['institute', id],
    queryFn: async (): Promise<Institute> => {
      const d = (await getDoc(doc(db, 'institutes', id))).data() ?? {};
      return {
        name: d.name ?? '',
        logoUrl: d.logoUrl,
        address: d.address,
        phone: d.phone,
        receiptPrefix: d.receiptPrefix ?? 'TD',
      };
    },
  });
}

const toDue = (d: { id: string; data: () => unknown }) => ({
  id: d.id,
  ...(d.data() as Omit<FeeDue, 'id'>),
});
const toPayment = (d: { id: string; data: () => unknown }) => ({
  id: d.id,
  ...(d.data() as Omit<Payment, 'id'>),
});

/** All dues that still have something to pay (pending or part-paid). */
export function useUnpaidDues() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'unpaid'],
    queryFn: async (): Promise<FeeDue[]> => {
      const snap = await getDocs(
        query(col(id, 'feeDues'), where('status', 'in', ['pending', 'partial'])),
      );
      return snap.docs.map(toDue);
    },
  });
}

export function useStudentDues(studentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'student', studentId],
    queryFn: async (): Promise<FeeDue[]> => {
      const snap = await getDocs(
        query(col(id, 'feeDues'), where('studentId', '==', studentId), orderBy('period', 'desc')),
      );
      return snap.docs.map(toDue);
    },
  });
}

export function useStudentPayments(studentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['payments', id, 'student', studentId],
    queryFn: async (): Promise<Payment[]> => {
      const snap = await getDocs(
        query(col(id, 'payments'), where('studentId', '==', studentId), orderBy('paidAt', 'desc')),
      );
      return snap.docs.map(toPayment);
    },
  });
}

export function useDue(dueId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'one', dueId],
    queryFn: async (): Promise<FeeDue | null> => {
      const snap = await getDoc(doc(db, 'institutes', id, 'feeDues', dueId));
      return snap.exists() ? toDue(snap) : null;
    },
  });
}

export function usePayment(paymentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['payments', id, 'one', paymentId],
    queryFn: async (): Promise<Payment | null> => {
      const snap = await getDoc(doc(db, 'institutes', id, 'payments', paymentId));
      return snap.exists() ? toPayment(snap) : null;
    },
  });
}

/** Payments (and reversals) recorded since the start of this month, Indian time. */
export function usePaymentsThisMonth() {
  const id = useInstituteId();
  const from = firstOfMonth(todayYmd());
  return useQuery({
    queryKey: ['payments', id, 'month', from],
    queryFn: async (): Promise<Payment[]> => {
      const start = Timestamp.fromDate(new Date(`${from}T00:00:00+05:30`));
      const snap = await getDocs(
        query(col(id, 'payments'), where('paidAt', '>=', start), orderBy('paidAt', 'desc')),
      );
      return snap.docs.map(toPayment);
    },
  });
}
