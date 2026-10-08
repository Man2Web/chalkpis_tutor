import { AppError, notFound, badRequest } from '../errors.js';
import { inTransaction, type Pool } from '../db.js';
import { checkLimit, requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { DAYS } from './schema.js';

export interface BatchRow {
  id: string;
  name: string;
  subject: string;
  class: string;
  days: string;
  start_time: string;
  end_time: string;
  default_fee: number;
  status: 'active' | 'archived';
  student_count?: number;
}

export const toBatch = (r: BatchRow) => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  class: r.class,
  days: r.days.split(',').filter(Boolean),
  startTime: r.start_time,
  endTime: r.end_time,
  defaultFee: Number(r.default_fee),
  status: r.status,
  studentCount: Number(r.student_count ?? 0),
});

const COUNT = `(SELECT COUNT(*) FROM student_batches sb JOIN students s ON s.id = sb.student_id AND s.institute_id = sb.institute_id
                 WHERE sb.batch_id = b.id AND sb.institute_id = b.institute_id AND s.status = 'active') AS student_count`;

const lockName = (instituteId: string) => `limits:${instituteId}`;
const order = (days: string[]) => DAYS.filter((d) => days.includes(d)).join(',');

export async function listBatches(
  pool: Pool,
  instituteId: string,
  status: 'active' | 'archived' | 'all',
) {
  const [rows] = (await pool.query(
    `SELECT b.*, ${COUNT} FROM batches b WHERE b.institute_id = ? ${status === 'all' ? '' : 'AND b.status = ?'} ORDER BY b.name`,
    status === 'all' ? [instituteId] : [instituteId, status],
  )) as unknown as [BatchRow[]];
  return rows.map(toBatch);
}

export async function getBatch(pool: Pool, instituteId: string, id: string) {
  const [rows] = (await pool.query(
    `SELECT b.*, ${COUNT} FROM batches b WHERE b.institute_id = ? AND b.id = ?`,
    [instituteId, id],
  )) as unknown as [BatchRow[]];
  if (!rows[0]) throw notFound(); // a batch of another institute looks exactly like one that does not exist
  return toBatch(rows[0]);
}

export interface BatchInput {
  name: string;
  subject: string;
  class: string;
  days: string[];
  startTime: string;
  endTime: string;
  defaultFee: number;
}

export async function createBatch(pool: Pool, instituteId: string, input: BatchInput, now: Date) {
  return withNamedLock(pool, lockName(instituteId), (conn) =>
    inTransaction(conn, async (c) => {
      const plan = await requireActivePlan(c, instituteId, now);
      await checkLimit(c, 'batch', instituteId, plan);
      const id = newId();
      await c.query(
        'INSERT INTO batches (id, institute_id, name, subject, class, days, start_time, end_time, default_fee) VALUES (?,?,?,?,?,?,?,?,?)',
        [
          id,
          instituteId,
          input.name,
          input.subject,
          input.class,
          order(input.days),
          input.startTime,
          input.endTime,
          input.defaultFee,
        ],
      );
      return id;
    }),
  );
}

export async function updateBatch(
  pool: Pool,
  instituteId: string,
  id: string,
  patch: Partial<BatchInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const current = await getBatch(pool, instituteId, id);
  const next = { ...current, ...patch };
  if (next.endTime <= next.startTime) throw badRequest('bad_request', { fields: ['endTime'] });
  await pool.query(
    'UPDATE batches SET name=?, subject=?, class=?, days=?, start_time=?, end_time=?, default_fee=? WHERE id=? AND institute_id=?',
    [
      next.name,
      next.subject,
      next.class,
      order(next.days as string[]),
      next.startTime,
      next.endTime,
      next.defaultFee,
      id,
      instituteId,
    ],
  );
}

/** Archiving keeps everything (attendance, fees). Restoring needs room under the plan's batch limit. */
export async function setBatchStatus(
  pool: Pool,
  instituteId: string,
  id: string,
  status: 'active' | 'archived',
  now: Date,
) {
  return withNamedLock(pool, lockName(instituteId), (conn) =>
    inTransaction(conn, async (c) => {
      const plan = await requireActivePlan(c, instituteId, now);
      const [rows] = (await c.query(
        'SELECT status FROM batches WHERE institute_id = ? AND id = ? FOR UPDATE',
        [instituteId, id],
      )) as unknown as [{ status: string }[]];
      if (!rows[0]) throw notFound();
      if (rows[0].status === status) return;
      if (status === 'active') await checkLimit(c, 'batch', instituteId, plan);
      await c.query('UPDATE batches SET status = ? WHERE id = ? AND institute_id = ?', [
        status,
        id,
        instituteId,
      ]);
    }),
  );
}

export async function addStudentsToBatch(
  pool: Pool,
  instituteId: string,
  batchId: string,
  studentIds: string[],
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await getBatch(pool, instituteId, batchId);
  const unique = [...new Set(studentIds)];
  const [rows] = (await pool.query(
    'SELECT COUNT(*) AS n FROM students WHERE institute_id = ? AND id IN (?)',
    [instituteId, unique],
  )) as unknown as [{ n: number }[]];
  if (Number(rows[0]?.n) !== unique.length) throw new AppError(400, 'unknown_student');
  await pool.query(
    'INSERT IGNORE INTO student_batches (institute_id, student_id, batch_id) VALUES ?',
    [unique.map((s) => [instituteId, s, batchId])],
  );
}

export async function removeStudentFromBatch(
  pool: Pool,
  instituteId: string,
  batchId: string,
  studentId: string,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await getBatch(pool, instituteId, batchId);
  await pool.query(
    'DELETE FROM student_batches WHERE institute_id = ? AND batch_id = ? AND student_id = ?',
    [instituteId, batchId, studentId],
  );
}
