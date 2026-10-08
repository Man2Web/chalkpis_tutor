import { AppError, notFound } from '../errors.js';
import { inTransaction, type Pool, type PoolConnection } from '../db.js';
import { requireActivePlan } from '../institutes/limits.js';
import { daysBetween, todayYmd } from '../lib/ist.js';
import { newId } from '../lib/ids.js';
import { enqueueAttendance } from '../messaging/notify.js';
import { withNamedLock } from '../lib/lock.js';
import { LOW_ATTENDANCE_PERCENT, toStat } from './stats.js';

type Db = Pool | PoolConnection;
type Mark = 'P' | 'A' | 'L';

async function requireBatch(
  db: Db,
  instituteId: string,
  batchId: string,
  code: 'unknown_batch' | 'not_found',
) {
  const [rows] = (await db.query('SELECT 1 FROM batches WHERE institute_id = ? AND id = ?', [
    instituteId,
    batchId,
  ])) as unknown as [unknown[]];
  if (!rows.length) throw code === 'not_found' ? notFound() : new AppError(400, code);
}

/**
 * Saves one batch's attendance for one day, replacing whatever was saved before (so a mark removed on the
 * screen does not linger). Future dates are refused. Returns what changed so messages can be queued later.
 */
export async function saveDay(
  pool: Pool,
  instituteId: string,
  userId: string,
  d: {
    batchId: string;
    date: string;
    marks: Record<string, Mark>;
    holiday?: 'holiday' | 'cancelled';
  },
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  if (d.date > todayYmd(now)) throw new AppError(400, 'future_date');
  await requireBatch(pool, instituteId, d.batchId, 'unknown_batch');
  const marks = d.holiday ? {} : d.marks;
  const studentIds = Object.keys(marks);
  if (studentIds.length) {
    const [rows] = (await pool.query(
      'SELECT COUNT(*) AS n FROM students WHERE institute_id = ? AND id IN (?)',
      [instituteId, studentIds],
    )) as unknown as [{ n: number }[]];
    if (Number(rows[0]?.n) !== studentIds.length) throw new AppError(400, 'unknown_student');
  }
  return withNamedLock(pool, `att:${instituteId}:${d.batchId}:${d.date}`, (conn) =>
    inTransaction(conn, async (c) => {
      const [prev] = (await c.query(
        `SELECT m.student_id, m.mark FROM attendance_marks m JOIN attendance_days a ON a.institute_id = m.institute_id AND a.id = m.day_id
          WHERE a.institute_id = ? AND a.batch_id = ? AND a.day = ?`,
        [instituteId, d.batchId, d.date],
      )) as unknown as [{ student_id: string; mark: Mark }[]];
      const before = new Map(prev.map((r) => [r.student_id, r.mark]));
      const id = newId();
      await c.query(
        `INSERT INTO attendance_days (id, institute_id, batch_id, day, holiday, marked_by) VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE holiday = VALUES(holiday), marked_by = VALUES(marked_by)`,
        [id, instituteId, d.batchId, d.date, d.holiday ?? null, userId],
      );
      const [[day]] = (await c.query(
        'SELECT id FROM attendance_days WHERE institute_id = ? AND batch_id = ? AND day = ?',
        [instituteId, d.batchId, d.date],
      )) as unknown as [[{ id: string }]];
      await c.query('DELETE FROM attendance_marks WHERE institute_id = ? AND day_id = ?', [
        instituteId,
        day.id,
      ]);
      if (studentIds.length)
        await c.query(
          'INSERT INTO attendance_marks (institute_id, day_id, student_id, mark) VALUES ?',
          [studentIds.map((s) => [instituteId, day.id, s, marks[s]])],
        );
      // Only students who were not already Absent/Late are told: a correction (Absent -> Late) sends nothing.
      const fresh = studentIds.filter((s) => before.get(s) !== 'A' && before.get(s) !== 'L');
      const absentNow = fresh.filter((s) => marks[s] === 'A');
      const lateNow = fresh.filter((s) => marks[s] === 'L');
      await enqueueAttendance(
        c,
        instituteId,
        { dayId: day.id, batchId: d.batchId, date: d.date, absentNow, lateNow },
        now,
      );
      return { id: day.id, absentNow, lateNow };
    }),
  );
}

export async function getDay(db: Db, instituteId: string, batchId: string, date: string) {
  await requireBatch(db, instituteId, batchId, 'not_found');
  const [days] = (await db.query(
    'SELECT id, holiday, marked_by, updated_at FROM attendance_days WHERE institute_id = ? AND batch_id = ? AND day = ?',
    [instituteId, batchId, date],
  )) as unknown as [{ id: string; holiday: string | null; marked_by: string; updated_at: Date }[]];
  const day = days[0];
  if (!day)
    return { batchId, date, saved: false, holiday: null, marks: {} as Record<string, Mark> };
  const [rows] = (await db.query(
    'SELECT student_id, mark FROM attendance_marks WHERE institute_id = ? AND day_id = ?',
    [instituteId, day.id],
  )) as unknown as [{ student_id: string; mark: Mark }[]];
  return {
    batchId,
    date,
    saved: true,
    holiday: day.holiday,
    markedAt: day.updated_at.toISOString(),
    marks: Object.fromEntries(rows.map((r) => [r.student_id, r.mark])),
  };
}

const MAX_RANGE_DAYS = 93;
function checkRange(from: string, to: string) {
  if (daysBetween(from, to) > MAX_RANGE_DAYS)
    throw new AppError(400, 'range_too_long', { maxDays: MAX_RANGE_DAYS });
}

/** Every saved day in a range (for the calendar and history screens). */
export async function listDays(
  db: Db,
  instituteId: string,
  q: { from: string; to: string; batchId?: string },
  scope: string[] | null = null,
) {
  checkRange(q.from, q.to);
  if (scope && !scope.length) return [];
  const args: unknown[] = [instituteId, q.from, q.to];
  let extra = '';
  if (q.batchId) {
    extra = ' AND a.batch_id = ?';
    args.push(q.batchId);
  }
  if (scope) {
    extra += ' AND a.batch_id IN (?)';
    args.push(scope);
  }
  const [rows] = (await db.query(
    `SELECT a.id, a.batch_id, DATE_FORMAT(a.day, '%Y-%m-%d') AS day, a.holiday, m.student_id, m.mark
       FROM attendance_days a LEFT JOIN attendance_marks m ON m.institute_id = a.institute_id AND m.day_id = a.id
      WHERE a.institute_id = ? AND a.day BETWEEN ? AND ?${extra} ORDER BY a.day, a.batch_id`,
    args,
  )) as unknown as [
    {
      id: string;
      batch_id: string;
      day: string;
      holiday: string | null;
      student_id: string | null;
      mark: Mark | null;
    }[],
  ];
  const days = new Map<
    string,
    { batchId: string; date: string; holiday: string | null; marks: Record<string, Mark> }
  >();
  for (const r of rows) {
    const d = days.get(r.id) ?? { batchId: r.batch_id, date: r.day, holiday: r.holiday, marks: {} };
    if (r.student_id && r.mark) d.marks[r.student_id] = r.mark;
    days.set(r.id, d);
  }
  return [...days.values()];
}

/** One student's marks across all batches in a range, newest first. */
export async function studentHistory(
  db: Db,
  instituteId: string,
  studentId: string,
  q: { from: string; to: string },
  scope: string[] | null = null,
) {
  checkRange(q.from, q.to);
  const [s] = (await db.query('SELECT 1 FROM students WHERE institute_id = ? AND id = ?', [
    instituteId,
    studentId,
  ])) as unknown as [unknown[]];
  if (!s.length) throw notFound();
  const [rows] = (await db.query(
    `SELECT DATE_FORMAT(a.day, '%Y-%m-%d') AS day, a.batch_id, m.mark
       FROM attendance_marks m JOIN attendance_days a ON a.institute_id = m.institute_id AND a.id = m.day_id
      WHERE m.institute_id = ? AND m.student_id = ? AND a.day BETWEEN ? AND ? AND a.holiday IS NULL${scope ? ' AND a.batch_id IN (?)' : ''}
      ORDER BY a.day DESC, a.batch_id`,
    scope ? [instituteId, studentId, q.from, q.to, scope] : [instituteId, studentId, q.from, q.to],
  )) as unknown as [{ day: string; batch_id: string; mark: Mark }[]];
  const days = rows.map((r) => ({ date: r.day, batchId: r.batch_id, mark: r.mark }));
  const stat = toStat(
    days.filter((d) => d.mark === 'P').length,
    days.filter((d) => d.mark === 'L').length,
    days.filter((d) => d.mark === 'A').length,
  );
  return { days, ...stat };
}

/** Per-student and class-wide attendance for a range. Holiday/cancelled days are ignored. */
export async function attendanceReport(
  db: Db,
  instituteId: string,
  q: { from: string; to: string; batchId?: string },
  scope: string[] | null = null,
) {
  if (daysBetween(q.from, q.to) > 366) throw new AppError(400, 'range_too_long', { maxDays: 366 });
  const empty = {
    overall: { ...toStat(0, 0, 0), sessions: 0, holidays: 0 },
    students: [] as never[],
    low: [] as never[],
  };
  if (scope && !scope.length) return empty;
  const args: unknown[] = [instituteId, q.from, q.to];
  let extra = '';
  if (q.batchId) {
    extra = ' AND a.batch_id = ?';
    args.push(q.batchId);
  }
  if (scope) {
    extra += ' AND a.batch_id IN (?)';
    args.push(scope);
  }
  const [rows] = (await db.query(
    `SELECT m.student_id, s.name, SUM(m.mark = 'P') AS p, SUM(m.mark = 'L') AS l, SUM(m.mark = 'A') AS a
       FROM attendance_marks m
       JOIN attendance_days a ON a.institute_id = m.institute_id AND a.id = m.day_id
       JOIN students s ON s.institute_id = m.institute_id AND s.id = m.student_id
      WHERE m.institute_id = ? AND a.day BETWEEN ? AND ? AND a.holiday IS NULL${extra}
      GROUP BY m.student_id, s.name ORDER BY s.name, m.student_id`,
    args,
  )) as unknown as [{ student_id: string; name: string; p: number; l: number; a: number }[]];
  const students = rows.map((r) => ({
    studentId: r.student_id,
    name: r.name,
    ...toStat(Number(r.p), Number(r.l), Number(r.a)),
  }));
  const [counts] = (await db.query(
    `SELECT SUM(a.holiday IS NULL) AS sessions, SUM(a.holiday IS NOT NULL) AS holidays FROM attendance_days a
      WHERE a.institute_id = ? AND a.day BETWEEN ? AND ?${extra}`,
    args,
  )) as unknown as [{ sessions: number | null; holidays: number | null }[]];
  const sum = (k: 'present' | 'late' | 'absent') => students.reduce((t, s) => t + s[k], 0);
  return {
    overall: {
      ...toStat(sum('present'), sum('late'), sum('absent')),
      sessions: Number(counts[0]?.sessions ?? 0),
      holidays: Number(counts[0]?.holidays ?? 0),
    },
    students,
    low: students
      .filter((s) => s.pct !== null && s.pct < LOW_ATTENDANCE_PERCENT)
      .sort((a, b) => (a.pct as number) - (b.pct as number)),
  };
}
