import {
  Timestamp,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  increment,
  serverTimestamp,
  writeBatch,
} from '@react-native-firebase/firestore';
import { getDownloadURL, putFile, ref } from '@react-native-firebase/storage';
import { db, storage } from '../../lib/firebase';
import { parseRupeesToPaise } from '../../lib/money';
import { normalizeIndianPhone } from '../../lib/phone';
import type { FeeCycle } from '../../lib/types';
import { membershipDelta } from './logic';
import type { StudentForm } from './schema';

const studentRef = (instituteId: string, id: string) =>
  doc(db, 'institutes', instituteId, 'students', id);
const batchRef = (instituteId: string, id: string) =>
  doc(db, 'institutes', instituteId, 'batches', id);

function fields(form: StudentForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() ? normalizeIndianPhone(form.phone) : '',
    parentName: form.parentName.trim(),
    parentPhone: normalizeIndianPhone(form.parentPhone),
    class: form.class.trim(),
    monthlyFee: parseRupeesToPaise(form.monthlyFee) ?? 0,
    feeCycle: form.feeCycle,
    dueDay: form.dueDay,
    notifyParent: form.notifyParent,
    notes: form.notes ?? '',
  };
}

const joinedAt = (form: StudentForm) =>
  form.joinedOn ? Timestamp.fromDate(new Date(`${form.joinedOn}T00:00:00+05:30`)) : undefined;

/** Creates a student in the given batches and bumps each batch's studentCount in one write. */
export async function createStudent(
  instituteId: string,
  form: StudentForm,
  batchIds: string[],
  photoUri?: string,
): Promise<string> {
  const ref_ = doc(collection(db, 'institutes', instituteId, 'students'));
  const batch = writeBatch(db);
  batch.set(ref_, {
    ...fields(form),
    photoUrl: null,
    joinedAt: joinedAt(form) ?? Timestamp.now(),
    status: 'active',
    batchIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  for (const id of batchIds)
    batch.update(batchRef(instituteId, id), {
      studentCount: increment(1),
      updatedAt: serverTimestamp(),
    });
  await batch.commit();
  if (photoUri) await uploadStudentPhoto(instituteId, ref_.id, photoUri).catch(() => undefined);
  return ref_.id;
}

/** Edits a student. Batch counts only change for active students. */
export async function updateStudent(
  instituteId: string,
  id: string,
  form: StudentForm,
  before: { batchIds: string[]; status: 'active' | 'inactive' },
  batchIds: string[],
  photoUri?: string,
) {
  const batch = writeBatch(db);
  batch.update(studentRef(instituteId, id), {
    ...fields(form),
    batchIds,
    updatedAt: serverTimestamp(),
  });
  if (before.status === 'active') {
    const { added, removed } = membershipDelta(before.batchIds, batchIds);
    for (const b of added)
      batch.update(batchRef(instituteId, b), {
        studentCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    for (const b of removed)
      batch.update(batchRef(instituteId, b), {
        studentCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
  }
  await batch.commit();
  if (photoUri) await uploadStudentPhoto(instituteId, id, photoUri);
}

/** Soft delete / restore. History (attendance, fees) is kept. */
export async function setStudentStatus(
  instituteId: string,
  id: string,
  batchIds: string[],
  status: 'active' | 'inactive',
) {
  const batch = writeBatch(db);
  batch.update(studentRef(instituteId, id), { status, updatedAt: serverTimestamp() });
  const delta = status === 'active' ? 1 : -1;
  for (const b of batchIds)
    batch.update(batchRef(instituteId, b), {
      studentCount: increment(delta),
      updatedAt: serverTimestamp(),
    });
  await batch.commit();
}

export async function uploadStudentPhoto(instituteId: string, id: string, uri: string) {
  const r = ref(storage, `institutes/${instituteId}/students/${id}.jpg`);
  await putFile(r, uri);
  const url = await getDownloadURL(r);
  const batch = writeBatch(db);
  batch.update(studentRef(instituteId, id), { photoUrl: url, updatedAt: serverTimestamp() });
  await batch.commit();
}

export interface BulkStudent {
  name: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  className: string;
  monthlyFeePaise: number;
  feeCycle: FeeCycle;
  dueDay: number;
  batchIds: string[];
}

/** Imports many students. Chunked (<=200 students per write); one count update per batch per chunk. */
export async function bulkCreateStudents(
  instituteId: string,
  items: BulkStudent[],
): Promise<number> {
  const CHUNK = 200;
  let created = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    const perBatch = new Map<string, number>();
    for (const s of chunk) {
      batch.set(doc(collection(db, 'institutes', instituteId, 'students')), {
        name: s.name,
        phone: s.phone,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        class: s.className,
        photoUrl: null,
        joinedAt: Timestamp.now(),
        status: 'active',
        batchIds: s.batchIds,
        monthlyFee: s.monthlyFeePaise,
        feeCycle: s.feeCycle,
        dueDay: s.dueDay,
        notifyParent: true,
        notes: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      for (const b of s.batchIds) perBatch.set(b, (perBatch.get(b) ?? 0) + 1);
    }
    for (const [b, n] of perBatch)
      batch.update(batchRef(instituteId, b), {
        studentCount: increment(n),
        updatedAt: serverTimestamp(),
      });
    await batch.commit();
    created += chunk.length;
  }
  return created;
}

export async function addStudentsToBatch(
  instituteId: string,
  batchId: string,
  studentIds: string[],
) {
  const batch = writeBatch(db);
  for (const id of studentIds)
    batch.update(studentRef(instituteId, id), {
      batchIds: arrayUnion(batchId),
      updatedAt: serverTimestamp(),
    });
  batch.update(batchRef(instituteId, batchId), {
    studentCount: increment(studentIds.length),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function removeStudentFromBatch(
  instituteId: string,
  batchId: string,
  studentId: string,
) {
  const batch = writeBatch(db);
  batch.update(studentRef(instituteId, studentId), {
    batchIds: arrayRemove(batchId),
    updatedAt: serverTimestamp(),
  });
  batch.update(batchRef(instituteId, batchId), {
    studentCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
