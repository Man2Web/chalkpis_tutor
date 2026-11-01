import { z } from 'zod';
import { withTransaction, type Pool } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { isRealDate, todayYmd, ymdRe } from '../lib/ist.js';

const day = z.string().regex(ymdRe).refine(isRealDate);

export const homeworkInput = z
  .object({
    batchId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    subject: z.string().trim().max(80).default(''),
    details: z.string().trim().max(2000).default(''),
    setOn: day.optional(),
    dueOn: day,
  })
  .refine((h) => !h.setOn || h.setOn <= h.dueOn, { message: 'due_before_set' });
export const homeworkPatch = z
  .object({
    title: z.string().trim().min(1).max(160),
    subject: z.string().trim().max(80),
    details: z.string().trim().max(2000),
    dueOn: day,
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);
export const homeworkQuery = z.object({ batchId: z.string().uuid().optional() });
export const checksInput = z.object({
  checks: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        // null clears the check (back to "not checked")
        status: z.enum(['done', 'missing']).nullable(),
      }),
    )
    .max(1000),
});

interface Row {
  id: string;
  batch_id: string;
  batch_name: string;
  title: string;
  subject: string;
  details: string;
  set_on: string;
  due_on: string;
}
const toHomework = (r: Row) => ({
  id: r.id,
  batchId: r.batch_id,
  batchName: r.batch_name,
  title: r.title,
  subject: r.subject,
  details: r.details,
  setOn: r.set_on,
  dueOn: r.due_on,
});
const COLUMNS = `h.id, h.batch_id, b.name AS batch_name, h.title, h.subject, h.details,
  DATE_FORMAT(h.set_on, '%Y-%m-%d') AS set_on, DATE_FORMAT(h.due_on, '%Y-%m-%d') AS due_on`;
const FROM = 'homework h JOIN batches b ON b.institute_id = h.institute_id AND b.id = h.batch_id';

/** Homework, latest due first, with how many were checked done and missing. */
export async function listHomework(pool: Pool, instituteId: string, batchId?: string) {
  const [rows] = (await pool.query(
    `SELECT ${COLUMNS},
       (SELECT COUNT(*) FROM homework_checks c WHERE c.institute_id = h.institute_id AND c.homework_id = h.id
          AND c.status = 'done') AS done,
       (SELECT COUNT(*) FROM homework_checks c WHERE c.institute_id = h.institute_id AND c.homework_id = h.id
          AND c.status = 'missing') AS missing,
       (SELECT COUNT(*) FROM student_batches sb
          JOIN students s ON s.institute_id = sb.institute_id AND s.id = sb.student_id
         WHERE sb.institute_id = h.institute_id AND sb.batch_id = h.batch_id AND s.status = 'active') AS roster
     FROM ${FROM}
     WHERE h.institute_id = ?${batchId ? ' AND h.batch_id = ?' : ''}
     ORDER BY h.due_on DESC, h.created_at DESC, h.id LIMIT 300`,
    batchId ? [instituteId, batchId] : [instituteId],
  )) as unknown as [(Row & { done: number; missing: number; roster: number })[]];
  return rows.map((r) => ({
    ...toHomework(r),
    done: Number(r.done),
    missing: Number(r.missing),
    students: Number(r.roster),
  }));
}

/** One piece of homework with who should hand it in (the batch's active students and anyone already checked). */
export async function getHomework(pool: Pool, instituteId: string, id: string) {
  const [[row]] = (await pool.query(
    `SELECT ${COLUMNS} FROM ${FROM} WHERE h.institute_id = ? AND h.id = ?`,
    [instituteId, id],
  )) as unknown as [[Row | undefined]];
  if (!row) throw notFound();
  const [checks] = (await pool.query(
    'SELECT student_id, status FROM homework_checks WHERE institute_id = ? AND homework_id = ?',
    [instituteId, id],
  )) as unknown as [{ student_id: string; status: 'done' | 'missing' }[]];
  const [members] = (await pool.query(
    `SELECT s.id FROM student_batches sb
       JOIN students s ON s.institute_id = sb.institute_id AND s.id = sb.student_id
      WHERE sb.institute_id = ? AND sb.batch_id = ? AND s.status = 'active'`,
    [instituteId, row.batch_id],
  )) as unknown as [{ id: string }[]];
  return {
    homework: toHomework(row),
    roster: [...new Set([...members.map((m) => m.id), ...checks.map((c) => c.student_id)])],
    checks: checks.map((c) => ({ studentId: c.student_id, status: c.status })),
  };
}

export async function createHomework(
  pool: Pool,
  instituteId: string,
  userId: string,
  input: z.infer<typeof homeworkInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const [batch] = (await pool.query('SELECT 1 FROM batches WHERE institute_id = ? AND id = ?', [
    instituteId,
    input.batchId,
  ])) as unknown as [unknown[]];
  if (!batch.length) throw notFound();
  const setOn = input.setOn ?? todayYmd(now);
  if (input.dueOn < setOn) throw badRequest('due_before_set');
  const id = newId();
  await pool.query(
    `INSERT INTO homework (id, institute_id, batch_id, title, subject, details, set_on, due_on, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      instituteId,
      input.batchId,
      input.title,
      input.subject,
      input.details,
      setOn,
      input.dueOn,
      userId,
      now,
    ],
  );
  return { id };
}

export async function updateHomework(
  pool: Pool,
  instituteId: string,
  id: string,
  p: z.infer<typeof homeworkPatch>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const map: Record<string, unknown> = {
    title: p.title,
    subject: p.subject,
    details: p.details,
    due_on: p.dueOn,
  };
  const sets = Object.entries(map).filter(([, v]) => v !== undefined);
  // a new due day may not come before the day it was set
  const [r] = (await pool.query(
    `UPDATE homework SET ${sets.map(([k]) => `${k} = ?`).join(', ')}
      WHERE institute_id = ? AND id = ?${p.dueOn ? ' AND set_on <= ?' : ''}`,
    [...sets.map(([, v]) => v), instituteId, id, ...(p.dueOn ? [p.dueOn] : [])],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) {
    const [found] = (await pool.query('SELECT 1 FROM homework WHERE institute_id = ? AND id = ?', [
      instituteId,
      id,
    ])) as unknown as [unknown[]];
    throw found.length ? badRequest('due_before_set') : notFound();
  }
}

export async function deleteHomework(pool: Pool, instituteId: string, id: string) {
  const [r] = (await pool.query('DELETE FROM homework WHERE institute_id = ? AND id = ?', [
    instituteId,
    id,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}

/** Saves the checks that were sent, all or none; a student twice or from another centre refuses the save. */
export async function saveChecks(
  pool: Pool,
  instituteId: string,
  id: string,
  input: z.infer<typeof checksInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const ids = input.checks.map((c) => c.studentId);
  if (new Set(ids).size !== ids.length) throw badRequest('duplicate_student');
  return withTransaction(pool, async (c) => {
    const [[hw]] = (await c.query(
      'SELECT id FROM homework WHERE institute_id = ? AND id = ? FOR UPDATE',
      [instituteId, id],
    )) as unknown as [[{ id: string } | undefined]];
    if (!hw) throw notFound();
    if (ids.length) {
      const [known] = (await c.query(
        'SELECT id FROM students WHERE institute_id = ? AND id IN (?)',
        [instituteId, ids],
      )) as unknown as [{ id: string }[]];
      if (known.length !== ids.length) throw badRequest('unknown_student');
    }
    for (const ch of input.checks) {
      if (ch.status === null)
        await c.query(
          'DELETE FROM homework_checks WHERE institute_id = ? AND homework_id = ? AND student_id = ?',
          [instituteId, id, ch.studentId],
        );
      else
        await c.query(
          `INSERT INTO homework_checks (institute_id, homework_id, student_id, status, checked_at)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status), checked_at = VALUES(checked_at)`,
          [instituteId, id, ch.studentId, ch.status, now],
        );
    }
    return { saved: input.checks.length };
  });
}

/**
 * A student's homework, latest due first: everything set for the batches they are in now (and anything they were
 * checked for before), with their own check. For the profile and the parent page.
 */
export async function studentHomework(
  pool: Pool,
  instituteId: string,
  studentId: string,
  limit = 20,
) {
  const [rows] = (await pool.query(
    `SELECT ${COLUMNS}, c.status
       FROM ${FROM}
       LEFT JOIN homework_checks c ON c.institute_id = h.institute_id AND c.homework_id = h.id AND c.student_id = ?
      WHERE h.institute_id = ? AND (c.student_id IS NOT NULL OR h.batch_id IN
        (SELECT sb.batch_id FROM student_batches sb WHERE sb.institute_id = ? AND sb.student_id = ?))
      ORDER BY h.due_on DESC, h.created_at DESC, h.id LIMIT ?`,
    [studentId, instituteId, instituteId, studentId, limit],
  )) as unknown as [(Row & { status: 'done' | 'missing' | null })[]];
  return rows.map((r) => ({ ...toHomework(r), status: r.status }));
}
