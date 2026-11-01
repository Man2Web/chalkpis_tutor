import { z } from 'zod';
import type { Pool } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { addDays, isRealDate, todayYmd, ymdRe } from '../lib/ist.js';

const day = z.string().regex(ymdRe).refine(isRealDate);
export const KINDS = ['holiday', 'exam', 'event', 'meeting'] as const;

export const eventInput = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(KINDS).default('event'),
  startsOn: day,
  endsOn: day.optional(),
  batchId: z.string().uuid().nullable().default(null),
  notes: z.string().trim().max(500).default(''),
});
export const eventPatch = z
  .object({
    title: z.string().trim().min(1).max(120),
    kind: z.enum(KINDS),
    startsOn: day,
    endsOn: day,
    batchId: z.string().uuid().nullable(),
    notes: z.string().trim().max(500),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);
/** A month and a bit at most per request (a month view with its leading and trailing days). */
export const rangeQuery = z
  .object({ from: day, to: day })
  .refine((q) => q.from <= q.to && q.to <= addDays(q.from, 62), { message: 'range' });

interface EventRow {
  id: string;
  title: string;
  kind: (typeof KINDS)[number];
  starts_on: string;
  ends_on: string;
  batch_id: string | null;
  batch_name: string | null;
  notes: string;
}
const toEvent = (r: EventRow) => ({
  id: r.id,
  title: r.title,
  kind: r.kind,
  startsOn: r.starts_on,
  endsOn: r.ends_on,
  batchId: r.batch_id,
  batchName: r.batch_name,
  notes: r.notes,
});
const EVENT_SELECT = `SELECT e.id, e.title, e.kind, DATE_FORMAT(e.starts_on, '%Y-%m-%d') AS starts_on,
    DATE_FORMAT(e.ends_on, '%Y-%m-%d') AS ends_on, e.batch_id, b.name AS batch_name, e.notes
  FROM calendar_events e LEFT JOIN batches b ON b.institute_id = e.institute_id AND b.id = e.batch_id`;

const requireBatch = async (
  pool: Pool,
  instituteId: string,
  batchId: string | null | undefined,
) => {
  if (!batchId) return;
  const [b] = (await pool.query('SELECT 1 FROM batches WHERE institute_id = ? AND id = ?', [
    instituteId,
    batchId,
  ])) as unknown as [unknown[]];
  if (!b.length) throw badRequest('unknown_batch');
};

/** Everything on the calendar between two days: the centre's events, tests, and homework due days. */
export async function calendarRange(pool: Pool, instituteId: string, from: string, to: string) {
  const [events] = (await pool.query(
    `${EVENT_SELECT} WHERE e.institute_id = ? AND e.starts_on <= ? AND e.ends_on >= ?
      ORDER BY e.starts_on, e.created_at, e.id LIMIT 500`,
    [instituteId, to, from],
  )) as unknown as [EventRow[]];
  const [exams] = (await pool.query(
    `SELECT x.id, x.name, x.subject, DATE_FORMAT(x.exam_date, '%Y-%m-%d') AS date, x.batch_id, b.name AS batch_name
       FROM exams x JOIN batches b ON b.institute_id = x.institute_id AND b.id = x.batch_id
      WHERE x.institute_id = ? AND x.exam_date BETWEEN ? AND ? ORDER BY x.exam_date, x.id LIMIT 500`,
    [instituteId, from, to],
  )) as unknown as [
    {
      id: string;
      name: string;
      subject: string;
      date: string;
      batch_id: string;
      batch_name: string;
    }[],
  ];
  const [homework] = (await pool.query(
    `SELECT h.id, h.title, h.subject, DATE_FORMAT(h.due_on, '%Y-%m-%d') AS due_on, h.batch_id, b.name AS batch_name
       FROM homework h JOIN batches b ON b.institute_id = h.institute_id AND b.id = h.batch_id
      WHERE h.institute_id = ? AND h.due_on BETWEEN ? AND ? ORDER BY h.due_on, h.id LIMIT 500`,
    [instituteId, from, to],
  )) as unknown as [
    {
      id: string;
      title: string;
      subject: string;
      due_on: string;
      batch_id: string;
      batch_name: string;
    }[],
  ];
  return {
    events: events.map(toEvent),
    exams: exams.map((x) => ({
      id: x.id,
      name: x.name,
      subject: x.subject,
      date: x.date,
      batchId: x.batch_id,
      batchName: x.batch_name,
    })),
    homework: homework.map((h) => ({
      id: h.id,
      title: h.title,
      subject: h.subject,
      dueOn: h.due_on,
      batchId: h.batch_id,
      batchName: h.batch_name,
    })),
  };
}

export async function createEvent(
  pool: Pool,
  instituteId: string,
  userId: string,
  input: z.infer<typeof eventInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await requireBatch(pool, instituteId, input.batchId);
  const endsOn = input.endsOn ?? input.startsOn;
  if (endsOn < input.startsOn) throw badRequest('ends_before_start');
  if (endsOn > addDays(input.startsOn, 366)) throw badRequest('too_long');
  const id = newId();
  await pool.query(
    `INSERT INTO calendar_events (id, institute_id, title, kind, starts_on, ends_on, batch_id, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      instituteId,
      input.title,
      input.kind,
      input.startsOn,
      endsOn,
      input.batchId,
      input.notes,
      userId,
      now,
    ],
  );
  return { id };
}

export async function getEvent(pool: Pool, instituteId: string, id: string) {
  const [[row]] = (await pool.query(`${EVENT_SELECT} WHERE e.institute_id = ? AND e.id = ?`, [
    instituteId,
    id,
  ])) as unknown as [[EventRow | undefined]];
  if (!row) throw notFound();
  return toEvent(row);
}

export async function updateEvent(
  pool: Pool,
  instituteId: string,
  id: string,
  p: z.infer<typeof eventPatch>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await requireBatch(pool, instituteId, p.batchId);
  const current = await getEvent(pool, instituteId, id);
  const startsOn = p.startsOn ?? current.startsOn;
  const endsOn =
    p.endsOn ?? (p.startsOn && current.endsOn < p.startsOn ? p.startsOn : current.endsOn);
  if (endsOn < startsOn) throw badRequest('ends_before_start');
  const map: Record<string, unknown> = {
    title: p.title,
    kind: p.kind,
    starts_on: startsOn,
    ends_on: endsOn,
    batch_id: p.batchId,
    notes: p.notes,
  };
  const sets = Object.entries(map).filter(([, v]) => v !== undefined);
  await pool.query(
    `UPDATE calendar_events SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE institute_id = ? AND id = ?`,
    [...sets.map(([, v]) => v), instituteId, id],
  );
}

export async function deleteEvent(pool: Pool, instituteId: string, id: string) {
  const [r] = (await pool.query('DELETE FROM calendar_events WHERE institute_id = ? AND id = ?', [
    instituteId,
    id,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}

/** What is coming up for one student in the next weeks: the centre's events for everyone or for their batches. */
export async function upcomingForStudent(
  pool: Pool,
  instituteId: string,
  studentId: string,
  now: Date,
  days = 45,
) {
  const today = todayYmd(now);
  const [rows] = (await pool.query(
    `${EVENT_SELECT} WHERE e.institute_id = ? AND e.ends_on >= ? AND e.starts_on <= ?
       AND (e.batch_id IS NULL OR e.batch_id IN
         (SELECT sb.batch_id FROM student_batches sb WHERE sb.institute_id = ? AND sb.student_id = ?))
      ORDER BY e.starts_on, e.id LIMIT 10`,
    [instituteId, today, addDays(today, days), instituteId, studentId],
  )) as unknown as [EventRow[]];
  return rows.map(toEvent);
}
