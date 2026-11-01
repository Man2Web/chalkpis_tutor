import { z } from 'zod';
import type { Pool } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { isRealDate, todayYmd, ymdRe } from '../lib/ist.js';
import { normalizeIndianPhone } from '../lib/phone.js';
import { studentInput } from '../students/schema.js';
import { createStudents } from '../students/service.js';

const day = z.string().regex(ymdRe).refine(isRealDate);
const phone = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const p = normalizeIndianPhone(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'phone' });
    return p ?? '';
  });
export const SOURCES = [
  'walk_in',
  'phone',
  'whatsapp',
  'referral',
  'social',
  'poster',
  'other',
] as const;
export const STATUSES = ['new', 'follow_up', 'trial', 'joined', 'lost'] as const;
/** Enquiries still being worked on (they count for follow-ups). */
const OPEN = ['new', 'follow_up', 'trial'];

export const enquiryInput = z.object({
  name: z.string().trim().min(1).max(80),
  parentName: z.string().trim().max(80).default(''),
  phone,
  class: z.string().trim().max(30).default(''),
  interest: z.string().trim().max(120).default(''),
  batchId: z.string().uuid().nullable().default(null),
  source: z.enum(SOURCES).default('walk_in'),
  nextFollowUp: day.nullable().default(null),
  /** the first note, if any ("Wants evening batch, will visit Saturday") */
  note: z.string().trim().max(1000).default(''),
});
export const enquiryPatch = z
  .object({
    name: z.string().trim().min(1).max(80),
    parentName: z.string().trim().max(80),
    phone,
    class: z.string().trim().max(30),
    interest: z.string().trim().max(120),
    batchId: z.string().uuid().nullable(),
    source: z.enum(SOURCES),
    status: z.enum(STATUSES),
    nextFollowUp: day.nullable(),
    lostReason: z.string().trim().max(200),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);
export const enquiryQuery = z.object({ status: z.enum(STATUSES).optional() });
export const noteInput = z.object({ note: z.string().trim().min(1).max(1000) });

interface Row {
  id: string;
  name: string;
  parent_name: string;
  phone: string;
  class: string;
  interest: string;
  batch_id: string | null;
  batch_name: string | null;
  source: (typeof SOURCES)[number];
  status: (typeof STATUSES)[number];
  next_follow_up: string | null;
  lost_reason: string;
  student_id: string | null;
  created_at: Date;
  notes: number;
  last_note: string | null;
}
const toEnquiry = (r: Row) => ({
  id: r.id,
  name: r.name,
  parentName: r.parent_name,
  phone: r.phone,
  class: r.class,
  interest: r.interest,
  batchId: r.batch_id,
  batchName: r.batch_name,
  source: r.source,
  status: r.status,
  nextFollowUp: r.next_follow_up,
  lostReason: r.lost_reason,
  studentId: r.student_id,
  createdAt: r.created_at.toISOString(),
  notes: Number(r.notes),
  lastNote: r.last_note,
});
const SELECT = `SELECT e.id, e.name, e.parent_name, e.phone, e.class, e.interest, e.batch_id, b.name AS batch_name,
    e.source, e.status, DATE_FORMAT(e.next_follow_up, '%Y-%m-%d') AS next_follow_up, e.lost_reason, e.student_id,
    e.created_at,
    (SELECT COUNT(*) FROM enquiry_notes n WHERE n.institute_id = e.institute_id AND n.enquiry_id = e.id) AS notes,
    (SELECT n.note FROM enquiry_notes n WHERE n.institute_id = e.institute_id AND n.enquiry_id = e.id
      ORDER BY n.created_at DESC, n.id DESC LIMIT 1) AS last_note
  FROM enquiries e LEFT JOIN batches b ON b.institute_id = e.institute_id AND b.id = e.batch_id`;

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

/**
 * The enquiries (one stage, or all), open ones with the soonest follow-up first, plus how many sit in each stage,
 * how many follow-ups are due today or earlier, and this month's joins and enquiries.
 */
export async function listEnquiries(
  pool: Pool,
  instituteId: string,
  status: (typeof STATUSES)[number] | undefined,
  now: Date,
) {
  const [rows] = (await pool.query(
    `${SELECT} WHERE e.institute_id = ?${status ? ' AND e.status = ?' : ''}
     ORDER BY FIELD(e.status, 'new', 'follow_up', 'trial', 'joined', 'lost'),
       e.next_follow_up IS NULL, e.next_follow_up, e.created_at DESC, e.id LIMIT 500`,
    status ? [instituteId, status] : [instituteId],
  )) as unknown as [Row[]];
  const today = todayYmd(now);
  const [counts] = (await pool.query(
    `SELECT status, COUNT(*) AS n,
       SUM(next_follow_up IS NOT NULL AND next_follow_up <= ? AND status IN (?)) AS due
     FROM enquiries WHERE institute_id = ? GROUP BY status`,
    [today, OPEN, instituteId],
  )) as unknown as [{ status: string; n: number; due: number | null }[]];
  const month = today.slice(0, 7);
  const [[m]] = (await pool.query(
    `SELECT COUNT(*) AS enquiries, SUM(status = 'joined') AS joined FROM enquiries
      WHERE institute_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?`,
    [instituteId, month],
  )) as unknown as [[{ enquiries: number; joined: number | null }]];
  return {
    enquiries: rows.map(toEnquiry),
    counts: Object.fromEntries(
      STATUSES.map((s) => [s, Number(counts.find((c) => c.status === s)?.n ?? 0)]),
    ),
    dueFollowUps: counts.reduce((t, c) => t + Number(c.due ?? 0), 0),
    thisMonth: { enquiries: Number(m.enquiries), joined: Number(m.joined ?? 0) },
  };
}

/** One enquiry with its notes, newest first. */
export async function getEnquiry(pool: Pool, instituteId: string, id: string) {
  const [[row]] = (await pool.query(`${SELECT} WHERE e.institute_id = ? AND e.id = ?`, [
    instituteId,
    id,
  ])) as unknown as [[Row | undefined]];
  if (!row) throw notFound();
  const [notes] = (await pool.query(
    `SELECT id, note, created_at FROM enquiry_notes WHERE institute_id = ? AND enquiry_id = ?
      ORDER BY created_at DESC, id DESC LIMIT 200`,
    [instituteId, id],
  )) as unknown as [{ id: string; note: string; created_at: Date }[]];
  return {
    enquiry: toEnquiry(row),
    notes: notes.map((n) => ({ id: n.id, note: n.note, createdAt: n.created_at.toISOString() })),
  };
}

export async function createEnquiry(
  pool: Pool,
  instituteId: string,
  userId: string,
  input: z.infer<typeof enquiryInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await requireBatch(pool, instituteId, input.batchId);
  const id = newId();
  await pool.query(
    `INSERT INTO enquiries (id, institute_id, name, parent_name, phone, class, interest, batch_id, source,
       status, next_follow_up, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      instituteId,
      input.name,
      input.parentName,
      input.phone,
      input.class,
      input.interest,
      input.batchId,
      input.source,
      // a follow-up day already set means it is being followed up
      input.nextFollowUp ? 'follow_up' : 'new',
      input.nextFollowUp,
      userId,
      now,
      now,
    ],
  );
  if (input.note)
    await pool.query(
      'INSERT INTO enquiry_notes (id, institute_id, enquiry_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newId(), instituteId, id, input.note, userId, now],
    );
  return { id };
}

export async function updateEnquiry(
  pool: Pool,
  instituteId: string,
  id: string,
  p: z.infer<typeof enquiryPatch>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await requireBatch(pool, instituteId, p.batchId);
  const map: Record<string, unknown> = {
    name: p.name,
    parent_name: p.parentName,
    phone: p.phone,
    class: p.class,
    interest: p.interest,
    batch_id: p.batchId,
    source: p.source,
    status: p.status,
    next_follow_up: p.nextFollowUp,
    lost_reason: p.lostReason,
  };
  // closed enquiries need no follow-up any more
  if (p.status === 'joined' || p.status === 'lost') map.next_follow_up = null;
  const sets = Object.entries(map).filter(([, v]) => v !== undefined);
  const [r] = (await pool.query(
    `UPDATE enquiries SET ${sets.map(([k]) => `${k} = ?`).join(', ')}, updated_at = ?
      WHERE institute_id = ? AND id = ?`,
    [...sets.map(([, v]) => v), now, instituteId, id],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}

export async function addNote(
  pool: Pool,
  instituteId: string,
  userId: string,
  id: string,
  note: string,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const [r] = (await pool.query(
    'UPDATE enquiries SET updated_at = ? WHERE institute_id = ? AND id = ?',
    [now, instituteId, id],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
  const noteId = newId();
  await pool.query(
    'INSERT INTO enquiry_notes (id, institute_id, enquiry_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [noteId, instituteId, id, note, userId, now],
  );
  return { id: noteId };
}

export async function deleteEnquiry(pool: Pool, instituteId: string, id: string) {
  const [r] = (await pool.query('DELETE FROM enquiries WHERE institute_id = ? AND id = ?', [
    instituteId,
    id,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}

/**
 * The enquiry joins: a student is added from what the owner confirmed (the usual rules: plan limit, batches, the
 * parent's welcome message), and the enquiry is marked Joined with that student.
 */
export async function convertEnquiry(
  pool: Pool,
  instituteId: string,
  id: string,
  input: z.infer<typeof studentInput>,
  now: Date,
) {
  const [[e]] = (await pool.query(
    'SELECT status, student_id FROM enquiries WHERE institute_id = ? AND id = ?',
    [instituteId, id],
  )) as unknown as [[{ status: string; student_id: string | null } | undefined]];
  if (!e) throw notFound();
  if (e.student_id) throw badRequest('already_joined', { studentId: e.student_id });
  const [studentId] = await createStudents(pool, instituteId, [input], now, { welcome: true });
  await pool.query(
    `UPDATE enquiries SET status = 'joined', student_id = ?, next_follow_up = NULL, updated_at = ?
      WHERE institute_id = ? AND id = ?`,
    [studentId, now, instituteId, id],
  );
  return { studentId: studentId! };
}
