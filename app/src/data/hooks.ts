import {
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
import { db } from '../lib/firebase';
import type { Batch, Student } from '../lib/types';

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

/** Call after writes so lists and counters refresh. */
export function useRefreshData() {
  const qc = useQueryClient();
  const id = useInstituteId();
  return () =>
    Promise.all(
      ['students', 'batches', 'limits', 'pendingDues'].map((k) =>
        qc.invalidateQueries({ queryKey: [k, id] }),
      ),
    );
}
