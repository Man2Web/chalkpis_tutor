import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@react-native-firebase/firestore';
import { db } from '../../lib/firebase';
import { parseRupeesToPaise } from '../../lib/money';
import type { Weekday } from '../../lib/types';
import type { BatchForm } from './schema';

const fields = (form: BatchForm) => ({
  name: form.name.trim(),
  subject: form.subject.trim(),
  class: form.class.trim(),
  days: form.days as Weekday[],
  startTime: form.startTime,
  endTime: form.endTime,
  defaultFee: parseRupeesToPaise(form.defaultFee) ?? 0,
});

export async function createBatch(instituteId: string, form: BatchForm): Promise<string> {
  const ref = doc(collection(db, 'institutes', instituteId, 'batches'));
  await setDoc(ref, {
    ...fields(form),
    status: 'active',
    staffUids: [],
    studentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export const updateBatch = (instituteId: string, id: string, form: BatchForm) =>
  updateDoc(doc(db, 'institutes', instituteId, 'batches', id), {
    ...fields(form),
    updatedAt: serverTimestamp(),
  });

/** Archiving keeps all history (attendance, fees). */
export const setBatchStatus = (instituteId: string, id: string, status: 'active' | 'archived') =>
  updateDoc(doc(db, 'institutes', instituteId, 'batches', id), {
    status,
    updatedAt: serverTimestamp(),
  });
