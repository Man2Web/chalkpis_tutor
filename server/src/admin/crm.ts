import { z } from 'zod';
import type { Pool } from '../db.js';
import { notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import type { AdminActor } from './service.js';

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0);

// ---------- live activity feed ----------

export type EventKind =
  | 'signup'
  | 'login'
  | 'activity'
  | 'message'
  | 'centre'
  | 'payment'
  | 'reversal'
  | 'attendance'
  | 'message-failed'
  | 'plan'
  | 'admin';

export const eventsQuery = z.object({
  kinds: z
    .string()
    .default('')
    .transform((v) => v.split(',').filter(Boolean)),
  limit: z.coerce.number().int().min(1).max(300).default(120),
  before: z.string().datetime().optional(),
  /** One centre's log only. */
  institute: z.string().uuid().optional(),
  /** Words to look for in who / what / which centre. */
  q: z.string().trim().max(80).default(''),
});

/** Logged too, but the feed shows them from their own tables (with the amount), so not twice. */
const SHOWN_ELSEWHERE = ['fee.payment', 'fee.advance', 'fee.reverse', 'attendance.save']
  .map((a) => `'${a}'`)
  .join(', ');

interface Ev {
  kind: EventKind;
  at: Date;
  actor: string;
  text: string;
  amount: number | null;
  user_id: string | null;
  institute_id: string | null;
  institute: string | null;
}

/**
 * One stream of what is happening on Chalkpis, newest first: sign-ups, sign-ins, new centres, payments and
 * corrections, attendance saved, WhatsApp failures, plan purchases and admin actions. Like a Slack channel.
 */
export async function events(pool: Pool, q: z.infer<typeof eventsQuery>, now: Date) {
  // rows get their time from the database clock; never cut off anything that is already there
  const before = q.before
    ? new Date(q.before)
    : new Date(Math.max(now.getTime(), Date.now()) + DAY);
  const since = new Date(before.getTime() - 30 * DAY);
  const all: Record<EventKind, string> = {
    signup: `SELECT 'signup' kind, u.created_at at, COALESCE(NULLIF(u.name,''), u.phone) actor, 'joined Chalkpis' text, NULL amount, u.id user_id, NULL institute_id, NULL institute
               FROM users u WHERE u.created_at >= ? AND u.created_at < ?`,
    login: `SELECT 'login' kind, l.created_at at, COALESCE(NULLIF(u.name,''), u.phone) actor, CONCAT_WS(CHAR(31), 'signed in', COALESCE(l.method, ''), COALESCE(l.platform, '')) text, NULL amount, u.id user_id, m.institute_id, i.name institute
               FROM login_events l JOIN users u ON u.id = l.user_id LEFT JOIN memberships m ON m.user_id = u.id LEFT JOIN institutes i ON i.id = m.institute_id
              WHERE l.created_at >= ? AND l.created_at < ?`,
    activity: `SELECT 'activity' kind, a.created_at at, COALESCE(NULLIF(u.name,''), u.phone, 'Someone') actor, CONCAT_WS(CHAR(31), a.action, a.subject, a.detail, COALESCE(a.platform, '')) text, NULL amount, a.user_id, i.id institute_id, i.name institute
               FROM activity_log a JOIN institutes i ON i.id = a.institute_id LEFT JOIN users u ON u.id = a.user_id
              WHERE a.action NOT IN (${SHOWN_ELSEWHERE}) AND a.created_at >= ? AND a.created_at < ?`,
    message: `SELECT 'message' kind, COALESCE(m.sent_at, m.created_at) at, i.name actor, CONCAT('WhatsApp ', REPLACE(m.type, '_', ' '), ' sent', COALESCE(CONCAT(' to the parent of ', s.name), '')) text, NULL amount, NULL user_id, i.id institute_id, i.name institute
               FROM messages m JOIN institutes i ON i.id = m.institute_id LEFT JOIN students s ON s.institute_id = m.institute_id AND s.id = m.student_id
              WHERE m.status = 'sent' AND m.created_at >= ? AND m.created_at < ?`,
    centre: `SELECT 'centre' kind, i.created_at at, COALESCE(NULLIF(u.name,''), u.phone) actor, 'created a centre' text, NULL amount, u.id user_id, i.id institute_id, i.name institute
               FROM institutes i JOIN users u ON u.id = i.owner_user_id WHERE i.created_at >= ? AND i.created_at < ?`,
    // payments and attendance name the person who entered them (the centre is in its own column)
    payment: `SELECT 'payment' kind, p.created_at at, COALESCE(NULLIF(u.name,''), u.phone, i.name) actor, CONCAT('recorded a fee from ', s.name) text, p.amount amount, p.recorded_by user_id, i.id institute_id, i.name institute
               FROM payments p JOIN institutes i ON i.id = p.institute_id JOIN students s ON s.institute_id = p.institute_id AND s.id = p.student_id LEFT JOIN users u ON u.id = p.recorded_by
              WHERE p.amount > 0 AND p.created_at >= ? AND p.created_at < ?`,
    reversal: `SELECT 'reversal' kind, p.created_at at, COALESCE(NULLIF(u.name,''), u.phone, i.name) actor, 'corrected (reversed) a payment' text, -p.amount amount, p.recorded_by user_id, i.id institute_id, i.name institute
               FROM payments p JOIN institutes i ON i.id = p.institute_id LEFT JOIN users u ON u.id = p.recorded_by WHERE p.amount < 0 AND p.created_at >= ? AND p.created_at < ?`,
    attendance: `SELECT 'attendance' kind, a.created_at at, COALESCE(NULLIF(u.name,''), u.phone, i.name) actor, CONCAT('marked attendance for ', b.name) text, NULL amount, a.marked_by user_id, i.id institute_id, i.name institute
               FROM attendance_days a JOIN institutes i ON i.id = a.institute_id JOIN batches b ON b.institute_id = a.institute_id AND b.id = a.batch_id LEFT JOIN users u ON u.id = a.marked_by
              WHERE a.created_at >= ? AND a.created_at < ?`,
    'message-failed': `SELECT 'message-failed' kind, m.created_at at, i.name actor, CONCAT('WhatsApp ', REPLACE(m.type, '_', ' '), ' failed: ', COALESCE(m.error, m.reason, 'unknown')) text, NULL amount, NULL user_id, i.id institute_id, i.name institute
               FROM messages m JOIN institutes i ON i.id = m.institute_id WHERE m.status = 'failed' AND m.created_at >= ? AND m.created_at < ?`,
    plan: `SELECT 'plan' kind, e.created_at at, i.name actor, CONCAT('bought the ', COALESCE(e.plan_id, ''), ' plan') text, e.amount amount, NULL user_id, i.id institute_id, i.name institute
               FROM billing_events e JOIN institutes i ON i.id = e.institute_id WHERE e.status = 'applied' AND e.created_at >= ? AND e.created_at < ?`,
    admin: `SELECT 'admin' kind, a.created_at at, a.admin_phone actor, CONCAT_WS(CHAR(31), a.action, COALESCE(a.target_phone, ''), COALESCE(a.detail, '')) text, NULL amount, a.target_user_id user_id, a.target_institute_id institute_id, NULL institute
               FROM admin_audit a WHERE a.created_at >= ? AND a.created_at < ?`,
  };
  // the platform-wide feed leaves out routine messages; one centre's log shows everything
  const defaults = (Object.keys(all) as EventKind[]).filter((k) => q.institute || k !== 'message');
  const kinds = (q.kinds.length ? q.kinds : defaults).filter((k): k is EventKind =>
    Object.hasOwn(all, k),
  );
  if (!kinds.length) return { events: [] };
  // each part is filtered by centre and words inside, so a busy centre cannot crowd out the one asked for
  const filters: string[] = [];
  const extra: unknown[] = [];
  if (q.institute) {
    filters.push('institute_id = ?');
    extra.push(q.institute);
  }
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filters.push('(actor LIKE ? OR text LIKE ? OR institute LIKE ?)');
    extra.push(like, like, like);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const sql = kinds
    .map((k) => `(SELECT * FROM (${all[k]}) p ${where} ORDER BY at DESC LIMIT ${q.limit})`)
    .join(' UNION ALL ');
  const args = kinds.flatMap(() => [since, before, ...extra]);
  const [rows] = (await pool.query(`SELECT * FROM (${sql}) x ORDER BY at DESC LIMIT ?`, [
    ...args,
    q.limit,
  ])) as unknown as [Ev[]];
  return {
    events: rows.map((r) => ({
      kind: r.kind,
      at: new Date(r.at).toISOString(),
      actor: r.actor ?? '',
      text:
        r.kind === 'admin'
          ? adminText(r.text ?? '')
          : r.kind === 'activity'
            ? activityText(r.text ?? '')
            : r.kind === 'login'
              ? loginText(r.text ?? '')
              : (r.text ?? ''),
      platform: r.kind === 'activity' || r.kind === 'login' ? platformOf(r.text ?? '') : null,
      amount: r.amount == null ? null : n(r.amount),
      userId: r.user_id,
      instituteId: r.institute_id,
      institute: r.institute,
    })),
  };
}

const ADMIN_ACTIONS: Record<string, string> = {
  block: 'blocked',
  unblock: 'unblocked',
  'sign-out': 'signed out everywhere',
  'set-plan': 'changed the plan of',
  announce: 'published an announcement',
  'end-announcement': 'ended an announcement',
  'retry-message': 'retried a WhatsApp message',
};
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "blocked +91… · reason", "published an announcement · New: poster maker": a sentence, never an internal id. */
export function adminText(raw: string): string {
  const [action = '', target = '', detail = ''] = raw.split(String.fromCharCode(31));
  const parts = [ADMIN_ACTIONS[action] ?? action.replace(/-/g, ' ')];
  if (target) parts[0] += ` ${target}`;
  if (detail && !ID.test(detail)) parts.push(detail);
  return parts.join(' · ');
}

const US = String.fromCharCode(31);
const METHODS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  google: 'Google',
  apple: 'Apple',
  email: 'email',
};
const DEVICES = new Set(['ios', 'android', 'web']);

/** The last part of a login or activity row is the phone it came from. */
const platformOf = (raw: string) => {
  const p = raw.split(US).pop() ?? '';
  return DEVICES.has(p) ? p : null;
};

/** "signed in with Google" (older rows: just "signed in"); the phone travels separately as `platform`. */
export function loginText(raw: string): string {
  const [base = 'signed in', method = ''] = raw.split(US);
  return METHODS[method] ? `${base} with ${METHODS[method]}` : base;
}

/** What each logged action reads as; {s} is what it was about (a student, a batch, a person). */
export const ACTIVITY_TEXT: Record<string, string> = {
  'student.add': 'added a student',
  'student.import': 'imported students',
  'student.edit': 'edited {s}',
  'student.deactivate': 'marked {s} as left',
  'student.reactivate': 'brought back {s}',
  'student.photo': 'added a photo of {s}',
  'student.photo-remove': "removed {s}'s photo",
  'parent.link': 'shared the parent link for {s}',
  'parent.unlink': 'turned off the parent link for {s}',
  'batch.add': 'created a batch',
  'batch.edit': 'edited the batch {s}',
  'batch.archive': 'archived the batch {s}',
  'batch.restore': 'restored the batch {s}',
  'batch.students-add': 'added students to {s}',
  'batch.student-remove': 'removed a student from {s}',
  'attendance.save': 'saved attendance for {s}',
  'fee.generate': 'generated fees',
  'fee.payment': 'recorded a fee from {s}',
  'fee.advance': 'recorded an advance from {s}',
  'fee.reverse': 'reversed a payment from {s}',
  'fee.charge': 'added a charge for {s}',
  'fee.discount': 'gave {s} a discount',
  'fee.waive': 'changed a waiver for {s}',
  'message.remind': 'sent a fee reminder to the parent of {s}',
  'message.receipt': 'sent a receipt to the parent of {s}',
  'fee.report-confirm': "confirmed the payment {s}'s parent reported",
  'fee.report-reject': "marked {s}'s reported payment as not received",
  'message.reminders': 'sent fee reminders to all parents',
  'settings.notifications': 'changed parent message settings',
  'settings.institute': 'updated the centre details',
  'settings.logo': 'changed the centre logo',
  'settings.logo-remove': 'removed the centre logo',
  'centre.onboarded': 'finished setting up the centre',
  'staff.add': 'added a staff member',
  'staff.batches': "changed {s}'s batches",
  'staff.remove': 'removed a staff member',
  'billing.checkout': 'started buying a plan',
  'task.add': 'added a task',
  'task.edit': 'updated a task',
  'task.delete': 'deleted a task',
};

/** "recorded a fee from Riya Sharma · ₹1,500 · upi": a sentence, falling back gracefully for new actions. */
export function activityText(raw: string): string {
  const [action = '', subject = '', detail = ''] = raw.split(US);
  const tpl = ACTIVITY_TEXT[action] ?? action.replace(/[.-]/g, ' ');
  const text = tpl.includes('{s}') ? tpl.replace('{s}', subject || 'a record') : tpl;
  return detail ? `${text} · ${detail}` : text;
}

// ---------- notes and tags ----------

export const noteBody = z.object({ body: z.string().trim().min(1).max(1000) });
export const TAGS = ['vip', 'follow-up', 'churn-risk', 'onboarding', 'partner', 'test'] as const;
export const tagsBody = z.object({ tags: z.array(z.enum(TAGS)).max(TAGS.length) });

async function requireInstitute(pool: Pool, id: string) {
  const [rows] = (await pool.query('SELECT id FROM institutes WHERE id = ?', [id])) as unknown as [
    { id: string }[],
  ];
  if (!rows[0]) throw notFound();
}

export async function notes(pool: Pool, instituteId: string) {
  const [rows] = (await pool.query(
    'SELECT id, author_phone, body, created_at FROM admin_notes WHERE institute_id = ? ORDER BY created_at DESC LIMIT 100',
    [instituteId],
  )) as unknown as [{ id: string; author_phone: string; body: string; created_at: Date }[]];
  return rows.map((r) => ({
    id: r.id,
    author: r.author_phone,
    body: r.body,
    at: r.created_at.toISOString(),
  }));
}

export async function addNote(
  pool: Pool,
  actor: AdminActor,
  instituteId: string,
  body: string,
  now: Date,
) {
  await requireInstitute(pool, instituteId);
  const id = newId();
  await pool.query(
    'INSERT INTO admin_notes (id, institute_id, author_phone, body, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, instituteId, actor.phone, body, now],
  );
  return { id };
}

/** Deletes a note and returns what it said, for the audit log. */
export async function deleteNote(pool: Pool, instituteId: string, noteId: string) {
  const [rows] = (await pool.query(
    'SELECT body FROM admin_notes WHERE id = ? AND institute_id = ?',
    [noteId, instituteId],
  )) as unknown as [{ body: string }[]];
  const [r] = (await pool.query('DELETE FROM admin_notes WHERE id = ? AND institute_id = ?', [
    noteId,
    instituteId,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
  return rows[0]?.body ?? '';
}

export async function tagsFor(pool: Pool, ids: string[]) {
  if (!ids.length) return new Map<string, string[]>();
  const [rows] = (await pool.query(
    'SELECT institute_id, tag FROM admin_tags WHERE institute_id IN (?) ORDER BY tag',
    [ids],
  )) as unknown as [{ institute_id: string; tag: string }[]];
  const m = new Map<string, string[]>();
  for (const r of rows) m.set(r.institute_id, [...(m.get(r.institute_id) ?? []), r.tag]);
  return m;
}

export async function setTags(pool: Pool, instituteId: string, tags: string[]) {
  await requireInstitute(pool, instituteId);
  await pool.query('DELETE FROM admin_tags WHERE institute_id = ?', [instituteId]);
  const unique = [...new Set(tags)];
  if (unique.length)
    await pool.query('INSERT INTO admin_tags (institute_id, tag) VALUES ?', [
      unique.map((t) => [instituteId, t]),
    ]);
  return { tags: unique.sort() };
}

// ---------- weekly cohort retention ----------

/** Monday (IST) of the week a date falls in, as yyyy-mm-dd. */
export function weekStart(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  const day = (ist.getUTCDay() + 6) % 7; // Monday = 0
  ist.setUTCDate(ist.getUTCDate() - day);
  return ist.toISOString().slice(0, 10);
}

/**
 * Centres grouped by the week they were created; for each later week, how many of them were active (saved
 * attendance or recorded a payment). The classic retention triangle.
 */
export async function cohorts(pool: Pool, weeks: number, now: Date) {
  const since = new Date(now.getTime() - weeks * 7 * DAY);
  const [inst] = (await pool.query('SELECT id, created_at FROM institutes WHERE created_at >= ?', [
    since,
  ])) as unknown as [{ id: string; created_at: Date }[]];
  const [act] = (await pool.query(
    `SELECT institute_id, created_at at FROM attendance_days WHERE created_at >= ?
     UNION ALL SELECT institute_id, paid_at at FROM payments WHERE paid_at >= ?`,
    [since, since],
  )) as unknown as [{ institute_id: string; at: Date }[]];
  const activeWeeks = new Map<string, Set<string>>();
  for (const a of act) {
    const w = weekStart(new Date(a.at));
    if (!activeWeeks.has(a.institute_id)) activeWeeks.set(a.institute_id, new Set());
    activeWeeks.get(a.institute_id)!.add(w);
  }
  const thisWeek = weekStart(now);
  const byCohort = new Map<string, string[]>();
  for (const i of inst) {
    const w = weekStart(i.created_at);
    byCohort.set(w, [...(byCohort.get(w) ?? []), i.id]);
  }
  const weeksBetween = (a: string, b: string) =>
    Math.round((Date.parse(b) - Date.parse(a)) / (7 * DAY));
  const rows = [...byCohort.keys()].sort().map((w) => {
    const ids = byCohort.get(w)!;
    const span = weeksBetween(w, thisWeek);
    const cells = Array.from({ length: span + 1 }, (_, k) => {
      const wk = new Date(Date.parse(w) + k * 7 * DAY).toISOString().slice(0, 10);
      return ids.filter((id) => activeWeeks.get(id)?.has(wk)).length;
    });
    return { week: w, size: ids.length, active: cells };
  });
  return { cohorts: rows };
}
