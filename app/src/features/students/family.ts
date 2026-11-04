import type { Student } from '../../lib/types';

type Self = Pick<Student, 'id' | 'familyId'>;
const byName = (a: Student, b: Student) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/** The brothers and sisters the owner linked to a child (decision 155), by name. */
export function siblingsOf(students: Student[], s: Self): Student[] {
  if (!s.familyId) return [];
  return students.filter((x) => x.id !== s.id && x.familyId === s.familyId).sort(byName);
}

/**
 * Children who may be this child's brothers or sisters: active, with the same parent number, and not already in its
 * family. Only a suggestion for the owner to confirm; a shared number never links anyone by itself.
 */
export function siblingSuggestions(
  students: Student[],
  parentPhone: string | null,
  self?: Self,
): Student[] {
  if (!parentPhone) return [];
  return students
    .filter(
      (x) =>
        x.status === 'active' &&
        x.parentPhone === parentPhone &&
        x.id !== self?.id &&
        !(self?.familyId && x.familyId === self.familyId),
    )
    .sort(byName)
    .slice(0, 3);
}

/**
 * Who can be linked to a child from its profile: everyone else not already in its family, those with the same
 * parent number first, then by name, narrowed by a search on name or class.
 */
export function linkCandidates(
  students: Student[],
  s: Self & Pick<Student, 'parentPhone'>,
  query: string,
): Student[] {
  const q = query.trim().toLowerCase();
  return students
    .filter(
      (x) =>
        x.id !== s.id &&
        !(s.familyId && x.familyId === s.familyId) &&
        (!q || x.name.toLowerCase().includes(q) || x.class.toLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        Number(b.parentPhone === s.parentPhone) - Number(a.parentPhone === s.parentPhone) ||
        Number(b.status === 'active') - Number(a.status === 'active') ||
        byName(a, b),
    )
    .slice(0, 30);
}
