import { toYmd } from '../../lib/dates';
import {
  LOW_ATTENDANCE_PERCENT,
  type AttendanceDoc,
  type Mark,
  type Student,
} from '../../lib/types';

/** Tap cycle: Present -> Absent -> Late -> Present. */
export const nextMark = (m: Mark): Mark => (m === 'P' ? 'A' : m === 'A' ? 'L' : 'P');

export interface Edits {
  date: string;
  marks: Record<string, Mark>;
}

/**
 * Applies one tap to the edit state. Pure, so it can run as a functional state update:
 * two taps in quick succession each build on the previous result, never on a stale render.
 * Edits belong to one date; switching date starts clean.
 */
export function tapMark(prev: Edits, date: string, studentId: string, base: Mark): Edits {
  const cur = prev.date === date ? prev.marks : {};
  return { date, marks: { ...cur, [studentId]: nextMark(cur[studentId] ?? base) } };
}

export interface RosterRow {
  student: Student;
  mark: Mark;
}

const joinedOn = (s: Student) => toYmd(s.joinedAt.toDate());

/**
 * Who appears for a batch on a date. Everyone defaults to Present.
 * - Saved marks always show (so past days stay editable even if the student later left).
 * - Otherwise: active students currently in the batch who had joined by that date.
 */
export function buildRoster(
  students: Student[],
  batchId: string,
  date: string,
  saved?: Record<string, Mark>,
): RosterRow[] {
  return students
    .filter(
      (s) =>
        (saved && s.id in saved) ||
        (s.status === 'active' && s.batchIds.includes(batchId) && joinedOn(s) <= date),
    )
    .map((student) => ({ student, mark: saved?.[student.id] ?? 'P' }));
}

export function counts(marks: Mark[]) {
  const c = { P: 0, A: 0, L: 0 };
  for (const m of marks) c[m]++;
  return c;
}

/** Late counts as attended. Null when there is nothing to measure. */
export function percentage(present: number, late: number, absent: number): number | null {
  const total = present + late + absent;
  return total === 0 ? null : Math.round(((present + late) / total) * 1000) / 10;
}

export interface Stat {
  present: number;
  late: number;
  absent: number;
  total: number;
  pct: number | null;
}

const toStat = (present: number, late: number, absent: number): Stat => ({
  present,
  late,
  absent,
  total: present + late + absent,
  pct: percentage(present, late, absent),
});

/** Per-student totals across the given days. Holiday/cancelled days are ignored. */
export function studentStats(docs: AttendanceDoc[]): Map<string, Stat> {
  const raw = new Map<string, { P: number; A: number; L: number }>();
  for (const d of docs) {
    if (d.holiday) continue;
    for (const [id, m] of Object.entries(d.marks)) {
      const r = raw.get(id) ?? { P: 0, A: 0, L: 0 };
      r[m]++;
      raw.set(id, r);
    }
  }
  return new Map([...raw].map(([id, r]) => [id, toStat(r.P, r.L, r.A)]));
}

/** Class-wide totals. `sessions` = days a class actually ran. */
export function overallStat(docs: AttendanceDoc[]): Stat & { sessions: number; holidays: number } {
  let P = 0,
    A = 0,
    L = 0,
    sessions = 0,
    holidays = 0;
  for (const d of docs) {
    if (d.holiday) {
      holidays++;
      continue;
    }
    sessions++;
    const c = counts(Object.values(d.marks));
    P += c.P;
    A += c.A;
    L += c.L;
  }
  return { ...toStat(P, L, A), sessions, holidays };
}

/** Students under the threshold, worst first. */
export function lowAttendance(stats: Map<string, Stat>, threshold = LOW_ATTENDANCE_PERCENT) {
  return [...stats]
    .filter(([, s]) => s.pct !== null && s.pct < threshold)
    .sort((a, b) => (a[1].pct as number) - (b[1].pct as number))
    .map(([studentId, stat]) => ({ studentId, stat }));
}

/** Per-batch totals. */
export function batchStats(docs: AttendanceDoc[]): Map<string, ReturnType<typeof overallStat>> {
  const by = new Map<string, AttendanceDoc[]>();
  for (const d of docs) by.set(d.batchId, [...(by.get(d.batchId) ?? []), d]);
  return new Map([...by].map(([id, list]) => [id, overallStat(list)]));
}

/**
 * The register as a spreadsheet: one row per student, one column per class day (P / A / L, H for a holiday),
 * then present, late, absent and %. Days are oldest first; students by name.
 */
export function registerSheet(
  docs: AttendanceDoc[],
  students: { id: string; name: string; class?: string }[],
): (string | number)[][] {
  const dates = [...new Set(docs.map((d) => d.date))].sort();
  const byStudent = new Map<string, Map<string, string>>();
  const holidays = new Set(docs.filter((d) => d.holiday).map((d) => d.date));
  for (const d of docs) {
    if (d.holiday) continue;
    for (const [sid, m] of Object.entries(d.marks)) {
      if (!byStudent.has(sid)) byStudent.set(sid, new Map());
      byStudent.get(sid)!.set(d.date, m);
    }
  }
  const header = ['Student', 'Class', ...dates, 'Present', 'Late', 'Absent', '%'];
  const rows = students
    .filter((s) => byStudent.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const marks = byStudent.get(s.id)!;
      const all = [...marks.values()];
      const p = all.filter((m) => m === 'P').length;
      const l = all.filter((m) => m === 'L').length;
      const a = all.filter((m) => m === 'A').length;
      return [
        s.name,
        s.class ?? '',
        ...dates.map((d) => marks.get(d) ?? (holidays.has(d) ? 'H' : '')),
        p,
        l,
        a,
        all.length ? Math.round(((p + l) / all.length) * 1000) / 10 : '',
      ];
    });
  return [header, ...rows];
}
