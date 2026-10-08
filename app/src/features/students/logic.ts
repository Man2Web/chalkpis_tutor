import type { Student } from '../../lib/types';

export interface StudentFilters {
  search: string;
  batchId?: string;
  className?: string;
  /** Only students that have an unpaid or part-paid due. */
  pendingOnly?: boolean;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** Search by name (case-insensitive substring) or phone digits (student or parent). */
export function filterStudents(
  students: Student[],
  f: StudentFilters,
  pendingIds: Set<string> = new Set(),
): Student[] {
  const q = f.search.trim().toLowerCase();
  const qd = digits(q);
  return students.filter((s) => {
    if (f.batchId && !s.batchIds.includes(f.batchId)) return false;
    if (f.className && s.class !== f.className) return false;
    if (f.pendingOnly && !pendingIds.has(s.id)) return false;
    if (!q) return true;
    if (s.name.toLowerCase().includes(q)) return true;
    return qd.length >= 3 && (digits(s.phone).includes(qd) || digits(s.parentPhone).includes(qd));
  });
}

/** Which batches gain / lose a member when a student's batch list changes. */
export function membershipDelta(before: string[], after: string[]) {
  return {
    added: after.filter((b) => !before.includes(b)),
    removed: before.filter((b) => !after.includes(b)),
  };
}

export const distinctClasses = (students: Student[]) =>
  [...new Set(students.map((s) => s.class).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

/** How many more active students the plan allows (Infinity when unlimited). */
export const remainingCapacity = (activeCount: number, limit: number | null | undefined) =>
  typeof limit === 'number' ? Math.max(0, limit - activeCount) : Infinity;
