import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from './db.js';

/**
 * The per-centre log the admin dashboard shows: after every successful change made inside a centre (a student
 * added, attendance saved, a fee recorded, a setting changed...) one row with who, what it was about and a short
 * detail. Written after the response, so it never slows down or breaks the request it describes.
 */

export const PLATFORMS = ['ios', 'android', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];

/** The phone the request came from, as the app reports it (X-Client-Platform). */
export function clientPlatform(req: FastifyRequest): Platform | null {
  const v = String(req.headers['x-client-platform'] ?? '').toLowerCase();
  return (PLATFORMS as readonly string[]).includes(v) ? (v as Platform) : null;
}

type Body = Record<string, unknown>;
type Lookup = { sql: string; param: (p: Record<string, string>, b: Body) => unknown };

interface Rule {
  action: string;
  /** Finds the name the action is about (a student, a batch, a staff member), scoped to the centre. */
  subject?: Lookup;
  detail?: (b: Body, p: Record<string, string>) => string;
}

const rupees = (paise: unknown) =>
  typeof paise === 'number'
    ? `₹${new Intl.NumberFormat('en-IN').format(Math.round(paise / 100))}`
    : '';

const STUDENT: Lookup = {
  sql: 'SELECT name FROM students WHERE institute_id = ? AND id = ?',
  param: (p) => p.id,
};
const STUDENT_FROM_BODY: Lookup = { ...STUDENT, param: (_p, b) => b.studentId };
const BATCH: Lookup = {
  sql: 'SELECT name FROM batches WHERE institute_id = ? AND id = ?',
  param: (p) => p.id,
};
const DUE_STUDENT: Lookup = {
  sql: 'SELECT s.name FROM fee_dues d JOIN students s ON s.institute_id = d.institute_id AND s.id = d.student_id WHERE d.institute_id = ? AND d.id = ?',
  param: (p) => p.id,
};
const PAYMENT_STUDENT: Lookup = {
  sql: 'SELECT s.name FROM payments x JOIN students s ON s.institute_id = x.institute_id AND s.id = x.student_id WHERE x.institute_id = ? AND x.id = ?',
  param: (p) => p.id,
};
const STAFF: Lookup = {
  sql: 'SELECT u.name FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.institute_id = ? AND m.user_id = ?',
  param: (p) => p.id,
};

/** Keyed by "METHOD /route/pattern". Routes not listed here are not logged (reads never are). */
export const RULES: Record<string, Rule> = {
  'POST /students': { action: 'student.add', detail: (b) => String(b.name ?? '') },
  'POST /students/bulk': {
    action: 'student.import',
    detail: (b) => (Array.isArray(b.students) ? `${b.students.length} students` : ''),
  },
  'PATCH /students/:id': { action: 'student.edit', subject: STUDENT },
  'POST /students/:id/deactivate': { action: 'student.deactivate', subject: STUDENT },
  'POST /students/:id/reactivate': { action: 'student.reactivate', subject: STUDENT },
  'DELETE /students/:id/photo': { action: 'student.photo-remove', subject: STUDENT },
  'POST /students/:id/parent-link': { action: 'parent.link', subject: STUDENT },
  'DELETE /students/:id/parent-link': { action: 'parent.unlink', subject: STUDENT },
  'POST /students/:id/remind': { action: 'message.remind', subject: STUDENT },

  'POST /batches': { action: 'batch.add', detail: (b) => String(b.name ?? '') },
  'PATCH /batches/:id': { action: 'batch.edit', subject: BATCH },
  'POST /batches/:id/archive': { action: 'batch.archive', subject: BATCH },
  'POST /batches/:id/restore': { action: 'batch.restore', subject: BATCH },
  'POST /batches/:id/students': {
    action: 'batch.students-add',
    subject: BATCH,
    detail: (b) => (Array.isArray(b.studentIds) ? `${b.studentIds.length} students` : ''),
  },
  'DELETE /batches/:id/students/:studentId': { action: 'batch.student-remove', subject: BATCH },

  'PUT /attendance': {
    action: 'attendance.save',
    subject: { ...BATCH, param: (_p, b) => b.batchId },
    detail: (b) => {
      if (b.holiday) return `${String(b.date ?? '')} · ${String(b.holiday)}`;
      const marks = Object.values((b.marks ?? {}) as Record<string, string>);
      const present = marks.filter((m) => m === 'P' || m === 'L').length;
      return `${String(b.date ?? '')} · ${present}/${marks.length} present`;
    },
  },

  'POST /fees/generate': {
    action: 'fee.generate',
    detail: (b) => String(b.period ?? 'this month'),
  },
  'POST /fees/dues/:id/payments': {
    action: 'fee.payment',
    subject: DUE_STUDENT,
    detail: (b) => [rupees(b.amount), String(b.mode ?? '')].filter(Boolean).join(' · '),
  },
  'POST /fees/advance': {
    action: 'fee.advance',
    subject: STUDENT_FROM_BODY,
    detail: (b) =>
      Array.isArray(b.months) ? `${b.months.length} months · ${String(b.mode ?? '')}` : '',
  },
  'POST /fees/payments/:id/reverse': { action: 'fee.reverse', subject: PAYMENT_STUDENT },
  'POST /fees/charges': {
    action: 'fee.charge',
    subject: STUDENT_FROM_BODY,
    detail: (b) => [String(b.description ?? ''), rupees(b.amount)].filter(Boolean).join(' · '),
  },
  'PATCH /fees/dues/:id/discount': {
    action: 'fee.discount',
    subject: DUE_STUDENT,
    detail: (b) => rupees(b.discount),
  },
  'POST /fees/dues/:id/waive': {
    action: 'fee.waive',
    subject: DUE_STUDENT,
    detail: (b) => (b.waived ? 'waived' : 'waiver undone'),
  },
  'POST /fees/payments/:id/send-receipt': { action: 'message.receipt', subject: PAYMENT_STUDENT },
  'POST /messages/reminders/run': { action: 'message.reminders' },
  'PUT /settings/notifications': {
    action: 'settings.notifications',
    detail: (b) => (b.enabled === false ? 'parent messages off' : 'parent messages on'),
  },

  'PATCH /institute': { action: 'settings.institute' },
  'DELETE /institute/logo': { action: 'settings.logo-remove' },
  'POST /me/onboarding-complete': { action: 'centre.onboarded' },

  'POST /staff': { action: 'staff.add', detail: (b) => String(b.name ?? b.phone ?? '') },
  'PUT /staff/:id/batches': {
    action: 'staff.batches',
    subject: STAFF,
    detail: (b) => (Array.isArray(b.batchIds) ? `${b.batchIds.length} batches` : ''),
  },
  'DELETE /staff/:id': { action: 'staff.remove' },

  'POST /billing/links': { action: 'billing.checkout', detail: (b) => String(b.planId ?? '') },
};

/** What the action was about, when the rule can look it up; never fails the log. */
async function subjectFor(
  pool: Pool,
  rule: Rule,
  inst: string,
  p: Record<string, string>,
  b: Body,
) {
  if (!rule.subject) return '';
  const id = rule.subject.param(p, b);
  if (typeof id !== 'string' || !id) return '';
  const [rows] = (await pool.query(rule.subject.sql, [inst, id])) as unknown as [
    { name: string }[],
  ];
  return rows[0]?.name ?? '';
}

export function activityLog(app: FastifyInstance, pool: Pool, clock?: () => Date) {
  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || reply.statusCode >= 400) return;
    const inst = req.auth?.instituteId;
    const rule = RULES[`${req.method} ${req.routeOptions.url ?? ''}`];
    if (!inst || !rule) return;
    try {
      const params = (req.params ?? {}) as Record<string, string>;
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Body;
      const subject = (await subjectFor(pool, rule, inst, params, body)).slice(0, 120);
      const detail = (rule.detail?.(body, params) ?? '').slice(0, 200);
      await pool.query(
        'INSERT INTO activity_log (institute_id, user_id, action, subject, detail, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          inst,
          req.auth!.userId,
          rule.action,
          subject,
          detail,
          clientPlatform(req),
          (clock ?? (() => new Date()))(),
        ],
      );
    } catch (err) {
      req.log.warn({ err: { message: (err as Error).message } }, 'activity log write failed');
    }
  });
}
