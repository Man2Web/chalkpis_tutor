import { doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { db } from '../../lib/firebase';
import { attendanceId } from '../../lib/dates';
import type { Mark } from '../../lib/types';

export interface SaveAttendance {
  instituteId: string;
  uid: string;
  batchId: string;
  date: string; // yyyy-mm-dd
  marks: Record<string, Mark>;
  holiday?: 'holiday' | 'cancelled';
  /** Keep the original createdAt when overwriting an existing day. */
  createdAt?: unknown;
}

/** One document per batch per day: a single write, replacing the whole day (so removed marks don't linger). */
export function saveAttendance(a: SaveAttendance) {
  return setDoc(
    doc(db, 'institutes', a.instituteId, 'attendance', attendanceId(a.batchId, a.date)),
    {
      batchId: a.batchId,
      date: a.date,
      marks: a.holiday ? {} : a.marks,
      holiday: !!a.holiday,
      reason: a.holiday ?? null,
      markedBy: a.uid,
      markedAt: serverTimestamp(),
      createdAt: a.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
}
