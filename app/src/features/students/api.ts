import { api, uploadImage } from '../../api/client';
import { parseRupeesToPaise } from '../../lib/money';
import { normalizeIndianPhone } from '../../lib/phone';
import type { FeeCycle } from '../../lib/types';
import type { StudentForm } from './schema';

/** New and returning students should owe this month's fee straight away, not after the nightly job. Safe to repeat. */
const createDuesNow = () => api('POST', '/fees/generate', {}).catch(() => undefined);

function fields(form: StudentForm) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim() ? (normalizeIndianPhone(form.phone) ?? '') : '',
    parentName: form.parentName.trim(),
    parentPhone: normalizeIndianPhone(form.parentPhone) ?? '',
    class: form.class.trim(),
    monthlyFee: parseRupeesToPaise(form.monthlyFee) ?? 0,
    feeCycle: form.feeCycle,
    dueDay: form.dueDay,
    notifyParent: form.notifyParent,
    notes: form.notes ?? '',
    dob: form.dob?.trim() ?? '',
    gender: form.gender ?? '',
  };
}

/** Creates a student in the given batches. The server keeps batch counts and the plan limit; the photo is optional. */
export async function createStudent(
  _instituteId: string,
  form: StudentForm,
  batchIds: string[],
  photoUri?: string,
): Promise<string> {
  const { id } = await api<{ id: string }>('POST', '/students', {
    ...fields(form),
    batchIds,
    ...(form.joinedOn
      ? { joinedAt: new Date(`${form.joinedOn}T00:00:00+05:30`).toISOString() }
      : {}),
  });
  await createDuesNow();
  if (photoUri) await uploadStudentPhoto(_instituteId, id, photoUri).catch(() => undefined);
  return id;
}

/** Edits a student, including which batches they are in. */
export async function updateStudent(
  instituteId: string,
  id: string,
  form: StudentForm,
  _before: { batchIds: string[]; status: 'active' | 'inactive' },
  batchIds: string[],
  photoUri?: string,
) {
  await api('PATCH', `/students/${id}`, { ...fields(form), batchIds });
  if (photoUri) await uploadStudentPhoto(instituteId, id, photoUri);
}

/** Soft delete / restore. History (attendance, fees) is kept. */
export async function setStudentStatus(
  _instituteId: string,
  id: string,
  _batchIds: string[],
  status: 'active' | 'inactive',
) {
  await api('POST', `/students/${id}/${status === 'active' ? 'reactivate' : 'deactivate'}`);
  if (status === 'active') await createDuesNow();
}

export async function uploadStudentPhoto(_instituteId: string, id: string, uri: string) {
  await uploadImage(`/students/${id}/photo`, uri);
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

/** Imports many students, all or none (the server checks the whole list against the plan limit first). */
export async function bulkCreateStudents(
  _instituteId: string,
  items: BulkStudent[],
): Promise<number> {
  const CHUNK = 200;
  let created = 0;
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const r = await api<{ ids: string[] }>('POST', '/students/bulk', {
      students: chunk.map((s) => ({
        name: s.name,
        phone: s.phone,
        parentName: s.parentName,
        parentPhone: s.parentPhone,
        class: s.className,
        monthlyFee: s.monthlyFeePaise,
        feeCycle: s.feeCycle,
        dueDay: s.dueDay,
        batchIds: s.batchIds,
      })),
    });
    created += r.ids.length;
  }
  await createDuesNow();
  return created;
}

export async function addStudentsToBatch(
  _instituteId: string,
  batchId: string,
  studentIds: string[],
) {
  await api('POST', `/batches/${batchId}/students`, { studentIds });
}

export async function removeStudentFromBatch(
  _instituteId: string,
  batchId: string,
  studentId: string,
) {
  await api('DELETE', `/batches/${batchId}/students/${studentId}`);
}
