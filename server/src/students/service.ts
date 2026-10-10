import { AppError, notFound } from '../errors.js';
import { inTransaction, type Pool, type PoolConnection } from '../db.js';
import { checkLimit, requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import type { StudentInput } from './schema.js';

interface StudentRow {
  id: string;
  name: string;
  phone: string;
  parent_name: string;
  parent_phone: string;
  class: string;
  dob: Date | string | null;
  gender: '' | 'male' | 'female' | 'other';
  photo_path: string | null;
  joined_at: Date;
  status: 'active' | 'inactive';
  monthly_fee: number;
  fee_cycle: 'monthly' | 'quarterly' | 'one-time';
  due_day: number;
  discount: number;
  notify_parent: number;
  notes: string;
}

/** DATE columns come back as a Date at UTC midnight (the pool runs in UTC). */
const ymd = (v: Date | string | null) =>
  v == null ? '' : typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);

export const toStudent = (r: StudentRow, batchIds: string[]) => ({
  id: r.id,
  name: r.name,
  phone: r.phone,
  parentName: r.parent_name,
  parentPhone: r.parent_phone,
  class: r.class,
  dob: ymd(r.dob),
  gender: r.gender,
  photoUrl: r.photo_path ? `/students/${r.id}/photo` : null,
  joinedAt: r.joined_at.toISOString(),
  status: r.status,
  monthlyFee: Number(r.monthly_fee),
  feeCycle: r.fee_cycle,
  dueDay: r.due_day,
  discount: Number(r.discount),
  notifyParent: !!r.notify_parent,
  notes: r.notes,
  batchIds,
});

const lockName = (instituteId: string) => `limits:${instituteId}`;

async function linksFor(
  db: Pool | PoolConnection,
  instituteId: string,
  ids: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>(ids.map((i) => [i, []]));
  if (!ids.length) return map;
  const [rows] = (await db.query(
    'SELECT student_id, batch_id FROM student_batches WHERE institute_id = ? AND student_id IN (?)',
    [instituteId, ids],
  )) as unknown as [{ student_id: string; batch_id: string }[]];
  for (const r of rows) map.get(r.student_id)?.push(r.batch_id);
  return map;
}

async function requireBatches(db: Pool | PoolConnection, instituteId: string, batchIds: string[]) {
  const unique = [...new Set(batchIds)];
  if (!unique.length) return;
  const [rows] = (await db.query(
    'SELECT COUNT(*) AS n FROM batches WHERE institute_id = ? AND id IN (?)',
    [instituteId, unique],
  )) as unknown as [{ n: number }[]];
  if (Number(rows[0]?.n) !== unique.length) throw new AppError(400, 'unknown_batch');
}

export async function listStudents(
  pool: Pool,
  instituteId: string,
  q: { status: 'active' | 'inactive' | 'all'; batchId?: string; limit: number; offset: number },
  scope: string[] | null = null,
) {
  if (scope && !scope.length) return [];
  const where = ['s.institute_id = ?'];
  const args: unknown[] = [instituteId];
  if (q.status !== 'all') {
    where.push('s.status = ?');
    args.push(q.status);
  }
  if (q.batchId) {
    where.push(
      'EXISTS (SELECT 1 FROM student_batches sb WHERE sb.student_id = s.id AND sb.institute_id = s.institute_id AND sb.batch_id = ?)',
    );
    args.push(q.batchId);
  }
  if (scope) {
    where.push(
      'EXISTS (SELECT 1 FROM student_batches sbs WHERE sbs.student_id = s.id AND sbs.institute_id = s.institute_id AND sbs.batch_id IN (?))',
    );
    args.push(scope);
  }
  const [rows] = (await pool.query(
    `SELECT s.* FROM students s WHERE ${where.join(' AND ')} ORDER BY s.name, s.id LIMIT ? OFFSET ?`,
    [...args, q.limit, q.offset],
  )) as unknown as [StudentRow[]];
  const links = await linksFor(
    pool,
    instituteId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toStudent(r, links.get(r.id) ?? []));
}

export async function getStudent(pool: Pool, instituteId: string, id: string) {
  const [rows] = (await pool.query('SELECT * FROM students WHERE institute_id = ? AND id = ?', [
    instituteId,
    id,
  ])) as unknown as [StudentRow[]];
  if (!rows[0]) throw notFound(); // another institute's student looks exactly like a missing one
  return toStudent(rows[0], (await linksFor(pool, instituteId, [id])).get(id) ?? []);
}

const insertRow = (instituteId: string, s: StudentInput, now: Date) => [
  newId(),
  instituteId,
  s.name,
  s.phone,
  s.parentName,
  s.parentPhone,
  s.class,
  s.dob || null,
  s.gender,
  s.joinedAt ? new Date(s.joinedAt) : now,
  s.monthlyFee,
  s.feeCycle,
  s.dueDay,
  s.discount,
  s.notifyParent ? 1 : 0,
  s.notes,
];
const COLS =
  'id, institute_id, name, phone, parent_name, parent_phone, class, dob, gender, joined_at, monthly_fee, fee_cycle, due_day, discount, notify_parent, notes';

/** Adds students (one or many) all-or-nothing, under the plan's student limit. Returns the new ids. */
export async function createStudents(
  pool: Pool,
  instituteId: string,
  students: StudentInput[],
  now: Date,
): Promise<string[]> {
  return withNamedLock(pool, lockName(instituteId), (conn) =>
    inTransaction(conn, async (c) => {
      const plan = await requireActivePlan(c, instituteId, now);
      await checkLimit(c, 'student', instituteId, plan, students.length);
      await requireBatches(
        c,
        instituteId,
        students.flatMap((s) => s.batchIds),
      );
      const ids: string[] = [];
      for (let i = 0; i < students.length; i += 200) {
        const chunk = students.slice(i, i + 200);
        const rows = chunk.map((s) => insertRow(instituteId, s, now));
        await c.query(`INSERT INTO students (${COLS}) VALUES ?`, [rows]);
        ids.push(...rows.map((r) => r[0] as string));
      }
      const links = students.flatMap((s, i) =>
        [...new Set(s.batchIds)].map((b) => [instituteId, ids[i], b]),
      );
      if (links.length)
        await c.query('INSERT INTO student_batches (institute_id, student_id, batch_id) VALUES ?', [
          links,
        ]);
      return ids;
    }),
  );
}

export async function updateStudent(
  pool: Pool,
  instituteId: string,
  id: string,
  patch: Partial<StudentInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await getStudent(pool, instituteId, id);
  const conn = await pool.getConnection();
  try {
    await inTransaction(conn, async (c) => {
      const map: Record<string, unknown> = {
        name: patch.name,
        phone: patch.phone,
        parent_name: patch.parentName,
        parent_phone: patch.parentPhone,
        class: patch.class,
        dob: patch.dob === undefined ? undefined : patch.dob || null,
        gender: patch.gender,
        monthly_fee: patch.monthlyFee,
        fee_cycle: patch.feeCycle,
        due_day: patch.dueDay,
        discount: patch.discount,
        notify_parent: patch.notifyParent === undefined ? undefined : patch.notifyParent ? 1 : 0,
        notes: patch.notes,
        joined_at: patch.joinedAt ? new Date(patch.joinedAt) : undefined,
      };
      const sets = Object.entries(map).filter(([, v]) => v !== undefined);
      if (sets.length)
        await c.query(
          `UPDATE students SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ? AND institute_id = ?`,
          [...sets.map(([, v]) => v), id, instituteId],
        );
      if (patch.batchIds) {
        await requireBatches(c, instituteId, patch.batchIds);
        await c.query('DELETE FROM student_batches WHERE institute_id = ? AND student_id = ?', [
          instituteId,
          id,
        ]);
        const unique = [...new Set(patch.batchIds)];
        if (unique.length)
          await c.query(
            'INSERT INTO student_batches (institute_id, student_id, batch_id) VALUES ?',
            [unique.map((b) => [instituteId, id, b])],
          );
      }
    });
  } finally {
    conn.release();
  }
}

/** Soft delete / restore. History (attendance, fees) is kept. Reactivating needs room under the plan limit. */
export async function setStudentStatus(
  pool: Pool,
  instituteId: string,
  id: string,
  status: 'active' | 'inactive',
  now: Date,
) {
  return withNamedLock(pool, lockName(instituteId), (conn) =>
    inTransaction(conn, async (c) => {
      const plan = await requireActivePlan(c, instituteId, now);
      const [rows] = (await c.query(
        'SELECT status FROM students WHERE institute_id = ? AND id = ? FOR UPDATE',
        [instituteId, id],
      )) as unknown as [{ status: string }[]];
      if (!rows[0]) throw notFound();
      if (rows[0].status === status) return;
      if (status === 'active') await checkLimit(c, 'student', instituteId, plan);
      await c.query('UPDATE students SET status = ? WHERE id = ? AND institute_id = ?', [
        status,
        id,
        instituteId,
      ]);
    }),
  );
}
