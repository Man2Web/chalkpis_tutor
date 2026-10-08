import { api } from '../../api/client';
import type { Mark } from '../../lib/types';

export interface SaveAttendance {
  instituteId: string;
  uid: string;
  batchId: string;
  date: string; // yyyy-mm-dd
  marks: Record<string, Mark>;
  holiday?: 'holiday' | 'cancelled';
  /** Kept for the screens that pass it; the server keeps the original creation time itself. */
  createdAt?: unknown;
}

/** One request per batch per day, replacing the whole day (so removed marks don't linger). The server also queues parent messages. */
export async function saveAttendance(a: SaveAttendance) {
  await api('PUT', '/attendance', {
    batchId: a.batchId,
    date: a.date,
    marks: a.holiday ? {} : a.marks,
    ...(a.holiday ? { holiday: a.holiday } : {}),
  });
}
