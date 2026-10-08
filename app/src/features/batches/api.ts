import { api } from '../../api/client';
import { parseRupeesToPaise } from '../../lib/money';
import type { BatchForm } from './schema';

const fields = (form: BatchForm) => ({
  name: form.name.trim(),
  subject: form.subject.trim(),
  class: form.class.trim(),
  days: form.days,
  startTime: form.startTime,
  endTime: form.endTime,
  defaultFee: parseRupeesToPaise(form.defaultFee) ?? 0,
});

export async function createBatch(_instituteId: string, form: BatchForm): Promise<string> {
  return (await api<{ id: string }>('POST', '/batches', fields(form))).id;
}

export async function updateBatch(_instituteId: string, id: string, form: BatchForm) {
  await api('PATCH', `/batches/${id}`, fields(form));
}

/** Archiving keeps all history (attendance, fees). */
export async function setBatchStatus(
  _instituteId: string,
  id: string,
  status: 'active' | 'archived',
) {
  await api('POST', `/batches/${id}/${status === 'archived' ? 'archive' : 'restore'}`);
}
