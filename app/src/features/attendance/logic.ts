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
 * The register as a spreadsheet: one row per student, one column per class held (P / A / L, H for a holiday), then
 * present, late, absent and %. A day when two batches met gets a column for each ("2026-10-05 Maths 10"), so a
 * student in both keeps both marks and the totals match the percentages on screen (studentStats counts every mark).
 * Days are oldest first; students by name. `levelLabel` heads the class column ("Belt", "Level"... by what the
 * centre teaches); `batchName` names the batch in a shared day's heading.
 */
export function registerSheet(
  docs: AttendanceDoc[],
  students: { id: string; name: string; class?: string }[],
  levelLabel = 'Class',
  batchName: (batchId: string) => string | undefined = () => undefined,
): (string | number)[][] {
  const nameOf = (batchId: string) => batchName(batchId) ?? batchId;
  const keyOf = (d: AttendanceDoc) => `${d.date}|${d.batchId}`;
  const columns = [...new Map(docs.map((d) => [keyOf(d), d])).values()].sort(
    (a, b) => a.date.localeCompare(b.date) || nameOf(a.batchId).localeCompare(nameOf(b.batchId)),
  );
  const perDate = new Map<string, number>();
  for (const c of columns) perDate.set(c.date, (perDate.get(c.date) ?? 0) + 1);
  const holidays = new Set(docs.filter((d) => d.holiday).map(keyOf));
  const byStudent = new Map<string, Map<string, Mark>>();
  for (const d of docs) {
    if (d.holiday) continue;
    for (const [sid, m] of Object.entries(d.marks)) {
      if (!byStudent.has(sid)) byStudent.set(sid, new Map());
      byStudent.get(sid)!.set(keyOf(d), m);
    }
  }
  const header = [
    'Student',
    levelLabel,
    ...columns.map((c) =>
      (perDate.get(c.date) ?? 0) > 1 ? `${c.date} ${nameOf(c.batchId)}` : c.date,
    ),
    'Present',
    'Late',
    'Absent',
    '%',
  ];
  const rows = students
    .filter((s) => byStudent.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const marks = byStudent.get(s.id)!;
      const c = counts([...marks.values()]);
      return [
        s.name,
        s.class ?? '',
        ...columns.map((col) => marks.get(keyOf(col)) ?? (holidays.has(keyOf(col)) ? 'H' : '')),
        c.P,
        c.L,
        c.A,
        percentage(c.P, c.L, c.A) ?? '',
      ];
    });
  return [header, ...rows];
}

/**
 * The colour of a "7/9 present" label: green when the class was well attended, amber when attendance was below
 * the low-attendance line, red when nobody came. Never green for 0 present.
 */
export function presentTone(
  present: number,
  total: number,
): 'neutral' | 'success' | 'warning' | 'danger' {
  if (total <= 0) return 'neutral';
  if (present === 0) return 'danger';
  return (present / total) * 100 < LOW_ATTENDANCE_PERCENT ? 'warning' : 'success';
}
