import { z } from 'zod';
import { withTransaction, type Pool } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { isRealDate, ymdRe } from '../lib/ist.js';
import { average, percentOf, ranks, type Result } from './logic.js';

const day = z.string().regex(ymdRe).refine(isRealDate);
/** Marks keep at most two decimals (45.5, 12.25). */
const amount = z
  .number()
  .min(0)
  .max(10000)
  .transform((v) => Math.round(v * 100) / 100);

export const examInput = z.object({
  batchId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(80).default(''),
  date: day,
  maxMarks: amount.refine((v) => v > 0),
  passPercent: z.number().int().min(0).max(100).default(35),
});
export const examPatch = z
  .object({
    name: z.string().trim().min(1).max(120),
    subject: z.string().trim().max(80),
    date: day,
    maxMarks: amount.refine((v) => v > 0),
    passPercent: z.number().int().min(0).max(100),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);
export const examQuery = z.object({ batchId: z.string().uuid().optional() });
export const marksInput = z.object({
  marks: z
    .array(
      z.object({
        studentId: z.string().uuid(),
        marks: amount.nullable(),
        absent: z.boolean().default(false),
        remark: z.string().trim().max(200).default(''),
      }),
    )
    .max(1000),
});

interface ExamRow {
  id: string;
  batch_id: string;
  batch_name: string;
  name: string;
  subject: string;
  date: string;
  max_marks: number;
  pass_percent: number;
}
const toExam = (r: ExamRow) => ({
  id: r.id,
  batchId: r.batch_id,
  batchName: r.batch_name,
  name: r.name,
  subject: r.subject,
  date: r.date,
  maxMarks: Number(r.max_marks),
  passPercent: Number(r.pass_percent),
});
const EXAM_COLUMNS = `e.id, e.batch_id, b.name AS batch_name, e.name, e.subject,
  DATE_FORMAT(e.exam_date, '%Y-%m-%d') AS date, e.max_marks, e.pass_percent`;
const EXAM_FROM = 'exams e JOIN batches b ON b.institute_id = e.institute_id AND b.id = e.batch_id';

/** The tests, newest first, with how many results are in and the average so far. */
export async function listExams(pool: Pool, instituteId: string, batchId?: string) {
  const [rows] = (await pool.query(
    `SELECT ${EXAM_COLUMNS},
       (SELECT COUNT(*) FROM exam_marks m WHERE m.institute_id = e.institute_id AND m.exam_id = e.id
          AND (m.marks IS NOT NULL OR m.absent = 1)) AS entered,
       (SELECT AVG(m.marks) FROM exam_marks m WHERE m.institute_id = e.institute_id AND m.exam_id = e.id
          AND m.absent = 0 AND m.marks IS NOT NULL) AS avg_marks,
       (SELECT COUNT(*) FROM student_batches sb
          JOIN students s ON s.institute_id = sb.institute_id AND s.id = sb.student_id
         WHERE sb.institute_id = e.institute_id AND sb.batch_id = e.batch_id AND s.status = 'active') AS roster
     FROM ${EXAM_FROM}
     WHERE e.institute_id = ?${batchId ? ' AND e.batch_id = ?' : ''}
     ORDER BY e.exam_date DESC, e.created_at DESC, e.id LIMIT 300`,
    batchId ? [instituteId, batchId] : [instituteId],
  )) as unknown as [(ExamRow & { entered: number; avg_marks: number | null; roster: number })[]];
  return rows.map((r) => ({
    ...toExam(r),
    entered: Number(r.entered),
    students: Number(r.roster),
    average: r.avg_marks === null ? null : Math.round(Number(r.avg_marks) * 10) / 10,
  }));
}

/** One test: its details, who should have a result (the batch's active students and anyone already marked), and the results. */
export async function getExam(pool: Pool, instituteId: string, id: string) {
  const [[row]] = (await pool.query(
    `SELECT ${EXAM_COLUMNS} FROM ${EXAM_FROM} WHERE e.institute_id = ? AND e.id = ?`,
    [instituteId, id],
  )) as unknown as [[ExamRow | undefined]];
  if (!row) throw notFound();
  const [marks] = (await pool.query(
    'SELECT student_id, marks, absent, remark FROM exam_marks WHERE institute_id = ? AND exam_id = ?',
    [instituteId, id],
  )) as unknown as [{ student_id: string; marks: number | null; absent: number; remark: string }[]];
  const [members] = (await pool.query(
    `SELECT s.id FROM student_batches sb
       JOIN students s ON s.institute_id = sb.institute_id AND s.id = sb.student_id
      WHERE sb.institute_id = ? AND sb.batch_id = ? AND s.status = 'active'`,
    [instituteId, row.batch_id],
  )) as unknown as [{ id: string }[]];
  const roster = [...new Set([...members.map((m) => m.id), ...marks.map((m) => m.student_id)])];
  return {
    exam: toExam(row),
    roster,
    results: marks.map((m) => ({
      studentId: m.student_id,
      marks: m.marks === null ? null : Number(m.marks),
      absent: !!m.absent,
      remark: m.remark,
    })),
  };
}

export async function createExam(
  pool: Pool,
  instituteId: string,
  userId: string,
  input: z.infer<typeof examInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const [batch] = (await pool.query('SELECT 1 FROM batches WHERE institute_id = ? AND id = ?', [
    instituteId,
    input.batchId,
  ])) as unknown as [unknown[]];
  if (!batch.length) throw notFound();
  const id = newId();
  await pool.query(
    `INSERT INTO exams (id, institute_id, batch_id, name, subject, exam_date, max_marks, pass_percent, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      instituteId,
      input.batchId,
      input.name,
      input.subject,
      input.date,
      input.maxMarks,
      input.passPercent,
      userId,
      now,
    ],
  );
  return { id };
}

export async function updateExam(
  pool: Pool,
  instituteId: string,
  id: string,
  p: z.infer<typeof examPatch>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await withTransaction(pool, async (c) => {
    const [[exam]] = (await c.query(
      'SELECT id FROM exams WHERE institute_id = ? AND id = ? FOR UPDATE',
      [instituteId, id],
    )) as unknown as [[{ id: string } | undefined]];
    if (!exam) throw notFound();
    // a lower maximum must still hold every mark already given
    if (p.maxMarks !== undefined) {
      const [[top]] = (await c.query(
        'SELECT MAX(marks) AS top FROM exam_marks WHERE institute_id = ? AND exam_id = ?',
        [instituteId, id],
      )) as unknown as [[{ top: number | null }]];
      if (top.top !== null && Number(top.top) > p.maxMarks) throw badRequest('marks_over_max');
    }
    const map: Record<string, unknown> = {
      name: p.name,
      subject: p.subject,
      exam_date: p.date,
      max_marks: p.maxMarks,
      pass_percent: p.passPercent,
    };
    const sets = Object.entries(map).filter(([, v]) => v !== undefined);
    await c.query(
      `UPDATE exams SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE institute_id = ? AND id = ?`,
      [...sets.map(([, v]) => v), instituteId, id],
    );
  });
}

export async function deleteExam(pool: Pool, instituteId: string, id: string) {
  const [r] = (await pool.query('DELETE FROM exams WHERE institute_id = ? AND id = ?', [
    instituteId,
    id,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}

/**
 * Saves the results that were sent, all or none. Absent wins over marks; a row with no marks, not absent and no
 * remark clears that student's result. Marks above the test's maximum, a student twice or a student from another
 * centre refuse the whole save.
 */
export async function saveMarks(
  pool: Pool,
  instituteId: string,
  id: string,
  input: z.infer<typeof marksInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const ids = input.marks.map((m) => m.studentId);
  if (new Set(ids).size !== ids.length) throw badRequest('duplicate_student');
  return withTransaction(pool, async (c) => {
    const [[exam]] = (await c.query(
      'SELECT max_marks FROM exams WHERE institute_id = ? AND id = ? FOR UPDATE',
      [instituteId, id],
    )) as unknown as [[{ max_marks: number } | undefined]];
    if (!exam) throw notFound();
    const max = Number(exam.max_marks);
    const over = input.marks.find((m) => !m.absent && m.marks !== null && m.marks > max);
    if (over) throw badRequest('marks_over_max', { studentId: over.studentId });
    if (ids.length) {
      const [known] = (await c.query(
        'SELECT id FROM students WHERE institute_id = ? AND id IN (?)',
        [instituteId, ids],
      )) as unknown as [{ id: string }[]];
      if (known.length !== ids.length) throw badRequest('unknown_student');
    }
    for (const m of input.marks) {
      const marks = m.absent ? null : m.marks;
      if (marks === null && !m.absent && !m.remark) {
        await c.query(
          'DELETE FROM exam_marks WHERE institute_id = ? AND exam_id = ? AND student_id = ?',
          [instituteId, id, m.studentId],
        );
        continue;
      }
      await c.query(
        `INSERT INTO exam_marks (institute_id, exam_id, student_id, marks, absent, remark, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE marks = VALUES(marks), absent = VALUES(absent), remark = VALUES(remark),
           updated_at = VALUES(updated_at)`,
        [instituteId, id, m.studentId, marks, m.absent ? 1 : 0, m.remark, now],
      );
    }
    return { saved: input.marks.length };
  });
}

/**
 * A student's tests, newest first: their marks (or absent), percentage, rank among those who sat it and the class
 * average. For the student's profile, the report card and the parent page.
 */
export async function studentExams(pool: Pool, instituteId: string, studentId: string, limit = 30) {
  const [rows] = (await pool.query(
    `SELECT ${EXAM_COLUMNS}, m.marks, m.absent, m.remark
       FROM exam_marks m JOIN exams e ON e.institute_id = m.institute_id AND e.id = m.exam_id
       JOIN batches b ON b.institute_id = e.institute_id AND b.id = e.batch_id
      WHERE m.institute_id = ? AND m.student_id = ?
      ORDER BY e.exam_date DESC, e.created_at DESC, e.id LIMIT ?`,
    [instituteId, studentId, limit],
  )) as unknown as [(ExamRow & { marks: number | null; absent: number; remark: string })[]];
  if (!rows.length) return [];
  const [all] = (await pool.query(
    'SELECT exam_id, student_id, marks, absent FROM exam_marks WHERE institute_id = ? AND exam_id IN (?)',
    [instituteId, rows.map((r) => r.id)],
  )) as unknown as [
    { exam_id: string; student_id: string; marks: number | null; absent: number }[],
  ];
  const byExam = new Map<string, Result[]>();
  for (const a of all) {
    const list = byExam.get(a.exam_id) ?? [];
    list.push({
      studentId: a.student_id,
      marks: a.marks === null ? null : Number(a.marks),
      absent: !!a.absent,
    });
    byExam.set(a.exam_id, list);
  }
  return rows.map((r) => {
    const results = byExam.get(r.id) ?? [];
    const rank = ranks(results);
    const marks = r.marks === null ? null : Number(r.marks);
    const max = Number(r.max_marks);
    return {
      ...toExam(r),
      marks,
      absent: !!r.absent,
      remark: r.remark,
      percent: marks === null || r.absent ? null : percentOf(marks, max),
      rank: rank.get(studentId) ?? null,
      of: rank.size,
      classAverage: average(results),
    };
  });
}
