import {
  Timestamp,
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from '@react-native-firebase/firestore';
import { db } from '../../lib/firebase';
import { normalizeIndianPhone } from '../../lib/phone';
import { parseRupeesToPaise } from '../../lib/money';
import type { StudentForm } from './schema';

/** Creates a student in the given batches and bumps each batch's studentCount in one write. */
export async function createStudent(
  instituteId: string,
  form: StudentForm,
  batchIds: string[],
): Promise<string> {
  const ref = doc(collection(db, 'institutes', instituteId, 'students'));
  const batch = writeBatch(db);
  batch.set(ref, {
    name: form.name.trim(),
    phone: form.phone.trim() ? normalizeIndianPhone(form.phone) : '',
    parentName: form.parentName.trim(),
    parentPhone: normalizeIndianPhone(form.parentPhone),
    class: form.class.trim(),
    photoUrl: null,
    joinedAt: Timestamp.now(),
    status: 'active',
    batchIds,
    monthlyFee: parseRupeesToPaise(form.monthlyFee) ?? 0,
    feeCycle: form.feeCycle,
    dueDay: form.dueDay,
    notifyParent: form.notifyParent,
    notes: form.notes ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  for (const id of batchIds) {
    batch.update(doc(db, 'institutes', instituteId, 'batches', id), {
      studentCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return ref.id;
}
