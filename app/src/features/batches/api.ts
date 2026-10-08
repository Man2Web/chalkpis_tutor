import { collection, doc, serverTimestamp, setDoc } from '@react-native-firebase/firestore';
import { db } from '../../lib/firebase';
import { parseRupeesToPaise } from '../../lib/money';
import type { Weekday } from '../../lib/types';
import type { BatchForm } from './schema';

export async function createBatch(instituteId: string, form: BatchForm): Promise<string> {
  const ref = doc(collection(db, 'institutes', instituteId, 'batches'));
  await setDoc(ref, {
    name: form.name.trim(),
    subject: form.subject.trim(),
    class: form.class.trim(),
    days: form.days as Weekday[],
    startTime: form.startTime,
    endTime: form.endTime,
    defaultFee: parseRupeesToPaise(form.defaultFee) ?? 0,
    status: 'active',
    staffUids: [],
    studentCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
