import { paidUrl } from '../billing/payLink.js';
import type { Pool, PoolConnection } from '../db.js';
import { planState, requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { addDays, daysBetween, todayYmd } from '../lib/ist.js';
import {
  overdueStage,
  periodText,
  rupees,
  varsFor,
  ymdText,
  type Lang,
  type MessageContext,
  type MessageType,
} from './templates.js';

type Db = Pool | PoolConnection;

export interface NotifySettings {
  enabled: boolean; // master switch; off until the owner turns it on
  absent: boolean;
  late: boolean;
  feeDue: boolean;
  feeDueDaysBefore: number; // 0-15
  feeOverdue: boolean;
  overdueEveryDays: number; // 1-30
  paymentReceived: boolean;
  /** A welcome to the parent when a student is added (one at a time; never on an import). */
  studentWelcome: boolean;
  /** A note to parents when today's class is marked as a holiday or cancelled. */
  classCancelled: boolean;
  language: Lang;
}

export const DEFAULT_SETTINGS: NotifySettings = {
  enabled: false,
  absent: true,
  late: true,
  feeDue: true,
  feeDueDaysBefore: 2,
  feeOverdue: true,
  overdueEveryDays: 7,
  paymentReceived: true,
  studentWelcome: true,
  classCancelled: true,
  language: 'en',
};

interface SettingsRow {
  enabled: number;
  absent: number;
  late: number;
  fee_due: number;
  fee_due_days_before: number;
  fee_overdue: number;
  overdue_every_days: number;
  payment_received: number;
  student_welcome: number;
  class_cancelled: number;
  language: Lang;
}

export async function getSettings(db: Db, instituteId: string): Promise<NotifySettings> {
  const [rows] = (await db.query('SELECT * FROM notify_settings WHERE institute_id = ?', [
    instituteId,
  ])) as unknown as [SettingsRow[]];
  const r = rows[0];
  if (!r) return { ...DEFAULT_SETTINGS };
  return {
    enabled: !!r.enabled,
    absent: !!r.absent,
    late: !!r.late,
    feeDue: !!r.fee_due,
    feeDueDaysBefore: r.fee_due_days_before,
    feeOverdue: !!r.fee_overdue,
    overdueEveryDays: r.overdue_every_days,
    paymentReceived: !!r.payment_received,
    studentWelcome: !!r.student_welcome,
    classCancelled: !!r.class_cancelled,
    language: r.language,
  };
}

export async function saveSettings(pool: Pool, instituteId: string, s: NotifySettings, now: Date) {
  await requireActivePlan(pool, instituteId, now);
  await pool.query(
    `INSERT INTO notify_settings (institute_id, enabled, absent, late, fee_due, fee_due_days_before, fee_overdue, overdue_every_days, payment_received, student_welcome, class_cancelled, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), absent = VALUES(absent), late = VALUES(late), fee_due = VALUES(fee_due),
       fee_due_days_before = VALUES(fee_due_days_before), fee_overdue = VALUES(fee_overdue), overdue_every_days = VALUES(overdue_every_days),
       payment_received = VALUES(payment_received), student_welcome = VALUES(student_welcome), class_cancelled = VALUES(class_cancelled),
       language = VALUES(language)`,
    [
      instituteId,
      +s.enabled,
      +s.absent,
      +s.late,
      +s.feeDue,
      s.feeDueDaysBefore,
      +s.feeOverdue,
      s.overdueEveryDays,
      +s.paymentReceived,
      +s.studentWelcome,
      +s.classCancelled,
      s.language,
    ],
  );
}

/** Days back from today that still trigger messages; editing old days must not message parents. */
export const ATTENDANCE_WINDOW_DAYS = 2;

interface Target {
  id: string;
  name: string;
  parent_name: string;
  parent_phone: string;
}

/** Active students whose parents have updates switched on, among `ids` (any others are silently left out). */
async function eligibleStudents(
  db: Db,
  instituteId: string,
  ids: string[],
): Promise<Map<string, Target>> {
  if (!ids.length) return new Map();
  const [rows] = (await db.query(
    "SELECT id, name, parent_name, parent_phone FROM students WHERE institute_id = ? AND status = 'active' AND notify_parent = 1 AND id IN (?)",
    [instituteId, ids],
  )) as unknown as [Target[]];
  return new Map(rows.map((r) => [r.id, r]));
}

async function instituteName(db: Db, instituteId: string): Promise<string> {
  const [rows] = (await db.query('SELECT name FROM institutes WHERE id = ?', [
    instituteId,
  ])) as unknown as [{ name: string }[]];
  return rows[0]?.name ?? '';
}

interface Queued {
  studentId: string;
  type: MessageType;
  key: string;
  lang: Lang;
  to: string;
  ctx: MessageContext;
}

/** Queues messages; a key that already exists is ignored (the same event never queues twice). Returns how many were new. */
async function queue(db: Db, instituteId: string, items: Queued[], now: Date): Promise<number> {
  if (!items.length) return 0;
  const [res] = (await db.query(
    'INSERT IGNORE INTO messages (id, institute_id, student_id, type, dedupe_key, lang, to_last4, vars, next_attempt_at) VALUES ?',
    [
      items.map((i) => [
        newId(),
        instituteId,
        i.studentId,
        i.type,
        i.key,
        i.lang,
        i.to.slice(-4),
        JSON.stringify(varsFor(i.type, i.ctx)),
        now,
      ]),
    ],
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}

/**
 * After an attendance save: queue a message for the parent of every student newly marked Absent or Late.
 * `absentNow` / `lateNow` are only students who were not already Absent/Late, so a correction sends nothing.
 */
export async function enqueueAttendance(
  db: Db,
  instituteId: string,
  d: { dayId: string; batchId: string; date: string; absentNow: string[]; lateNow: string[] },
  now: Date,
): Promise<number> {
  if (!d.absentNow.length && !d.lateNow.length) return 0;
  if (d.date < addDays(todayYmd(now), -ATTENDANCE_WINDOW_DAYS)) return 0;
  const s = await getSettings(db, instituteId);
  if (!s.enabled) return 0;
  const wantAbsent = s.absent ? d.absentNow : [];
  const wantLate = s.late ? d.lateNow : [];
  const students = await eligibleStudents(db, instituteId, [...wantAbsent, ...wantLate]);
  if (!students.size) return 0;
  const [[batch]] = (await db.query('SELECT name FROM batches WHERE institute_id = ? AND id = ?', [
    instituteId,
    d.batchId,
  ])) as unknown as [[{ name: string } | undefined]];
  const inst = await instituteName(db, instituteId);
  const items: Queued[] = [];
  for (const [ids, mark, type] of [
    [wantAbsent, 'A', 'absent'],
    [wantLate, 'L', 'late'],
  ] as const)
    for (const id of ids) {
      const st = students.get(id);
      if (!st) continue;
      items.push({
        studentId: id,
        type,
        key: `att_${d.dayId}_${id}_${mark}`,
        lang: s.language,
        to: st.parent_phone,
        ctx: {
          parent: st.parent_name,
          institute: inst,
          student: st.name,
          batch: batch?.name ?? '',
          date: ymdText(d.date, s.language),
        },
      });
    }
  return queue(db, instituteId, items, now);
}

/** After a payment is recorded: queue a thank-you with the receipt. Reversals never call this. */
export async function enqueuePayment(
  db: Db,
  instituteId: string,
  p: {
    paymentId: string;
    studentId: string;
    amount: number;
    receiptNo: string;
    balanceAfter: number;
  },
  now: Date,
): Promise<number> {
  const s = await getSettings(db, instituteId);
  if (!s.enabled || !s.paymentReceived) return 0;
  const st = (await eligibleStudents(db, instituteId, [p.studentId])).get(p.studentId);
  if (!st) return 0;
  return queue(
    db,
    instituteId,
    [
      {
        studentId: p.studentId,
        type: 'payment_received',
        key: `pay_${p.paymentId}`,
        lang: s.language,
        to: st.parent_phone,
        ctx: {
          parent: st.parent_name,
          institute: await instituteName(db, instituteId),
          student: st.name,
          amount: rupees(p.amount),
          receiptNo: p.receiptNo,
          balance: rupees(p.balanceAfter),
        },
      },
    ],
    now,
  );
}

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAME: Record<string, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

/** "17:30" -> "5:30 PM". */
export function clock12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** A batch the way a parent reads it: "Kids Beginners (Mon, Wed, Fri 5:00 PM)". */
export function batchWithSchedule(b: { name: string; days: string; start_time: string }): string {
  const days = b.days
    .split(',')
    .filter((d) => DAY_NAME[d])
    .sort((x, y) => DAY_ORDER.indexOf(x) - DAY_ORDER.indexOf(y))
    .map((d) => DAY_NAME[d]);
  const when = [days.join(', '), b.start_time ? clock12(b.start_time) : '']
    .filter(Boolean)
    .join(' ');
  return when ? `${b.name} (${when})` : b.name;
}

/**
 * A student was added (one at a time, not an import): welcome the parent and say which messages to expect on this
 * number. Sent once per student.
 */
export async function enqueueStudentWelcome(
  db: Db,
  instituteId: string,
  studentId: string,
  now: Date,
): Promise<number> {
  const s = await getSettings(db, instituteId);
  if (!s.enabled || !s.studentWelcome) return 0;
  const st = (await eligibleStudents(db, instituteId, [studentId])).get(studentId);
  if (!st) return 0;
  const [batches] = (await db.query(
    `SELECT b.name, b.days, b.start_time FROM student_batches sb JOIN batches b ON b.institute_id = sb.institute_id AND b.id = sb.batch_id
      WHERE sb.institute_id = ? AND sb.student_id = ? AND b.status = 'active' ORDER BY b.name`,
    [instituteId, studentId],
  )) as unknown as [{ name: string; days: string; start_time: string }[]];
  return queue(
    db,
    instituteId,
    [
      {
        studentId,
        type: 'student_welcome',
        key: `welcome_${studentId}`,
        lang: s.language,
        to: st.parent_phone,
        ctx: {
          parent: st.parent_name,
          institute: await instituteName(db, instituteId),
          student: st.name,
          batch: batches.map(batchWithSchedule).join(' and '),
        },
      },
    ],
    now,
  );
}

/**
 * Today's class of a batch was marked as a holiday or cancelled: tell the parents of its active students. Only for
 * today (a holiday recorded afterwards for a past day tells nobody), and once per day and student.
 */
export async function enqueueClassCancelled(
  db: Db,
  instituteId: string,
  d: { dayId: string; batchId: string; date: string },
  now: Date,
): Promise<number> {
  if (d.date !== todayYmd(now)) return 0;
  const s = await getSettings(db, instituteId);
  if (!s.enabled || !s.classCancelled) return 0;
  const [rows] = (await db.query(
    'SELECT student_id FROM student_batches WHERE institute_id = ? AND batch_id = ?',
    [instituteId, d.batchId],
  )) as unknown as [{ student_id: string }[]];
  const students = await eligibleStudents(
    db,
    instituteId,
    rows.map((r) => r.student_id),
  );
  if (!students.size) return 0;
  const [[batch]] = (await db.query('SELECT name FROM batches WHERE institute_id = ? AND id = ?', [
    instituteId,
    d.batchId,
  ])) as unknown as [[{ name: string } | undefined]];
  const inst = await instituteName(db, instituteId);
  const items: Queued[] = [...students.values()].map((st) => ({
    studentId: st.id,
    type: 'class_cancelled',
    key: `cancel_${d.dayId}_${st.id}`,
    lang: s.language,
    to: st.parent_phone,
    ctx: {
      parent: st.parent_name,
      institute: inst,
      student: st.name,
      batch: batch?.name ?? '',
      date: ymdText(d.date, s.language),
    },
  }));
  let n = 0;
  for (let i = 0; i < items.length; i += 500)
    n += await queue(db, instituteId, items.slice(i, i + 500), now);
  return n;
}

/**
 * Daily run for one institute: "due soon" and "overdue" reminders. Safe to run twice in a day (the keys dedupe).
 * Does nothing when the plan has ended or the owner has not switched messages on.
 */
export async function enqueueFeeReminders(
  pool: Pool,
  instituteId: string,
  now: Date,
  /** With these, each reminder carries the parent's "I've paid" link (FEE_PAID_LINK). */
  paidLinks?: { baseUrl: string; secret: string },
): Promise<number> {
  const s = await getSettings(pool, instituteId);
  if (!s.enabled || (!s.feeDue && !s.feeOverdue)) return 0;
  if (!(await planState(pool, instituteId, now)).active) return 0;
  const today = todayYmd(now);
  const [dues] = (await pool.query(
    `SELECT d.id, d.student_id, d.period, d.amount, d.discount, d.paid, DATE_FORMAT(d.due_date, '%Y-%m-%d') AS due_date
       FROM fee_dues d WHERE d.institute_id = ? AND d.status IN ('pending','partial')`,
    [instituteId],
  )) as unknown as [
    {
      id: string;
      student_id: string;
      period: string;
      amount: number;
      discount: number;
      paid: number;
      due_date: string;
    }[],
  ];
  const wanted: { due: (typeof dues)[number]; type: MessageType; key: string; owe: number }[] = [];
  for (const due of dues) {
    const owe = Math.max(0, Number(due.amount) - Number(due.discount) - Number(due.paid));
    if (owe <= 0) continue;
    const untilDue = daysBetween(today, due.due_date);
    if (s.feeDue && untilDue === s.feeDueDaysBefore && untilDue >= 0)
      wanted.push({ due, type: 'fee_due', key: `due_${due.id}`, owe });
    else if (s.feeOverdue) {
      const stage = overdueStage(-untilDue, s.overdueEveryDays);
      if (stage !== null)
        wanted.push({ due, type: 'fee_overdue', key: `overdue_${due.id}_${stage}`, owe });
    }
  }
  if (!wanted.length) return 0;
  const students = await eligibleStudents(pool, instituteId, [
    ...new Set(wanted.map((w) => w.due.student_id)),
  ]);
  const inst = await instituteName(pool, instituteId);
  const items: Queued[] = [];
  for (const w of wanted) {
    const st = students.get(w.due.student_id);
    if (!st) continue;
    items.push({
      studentId: w.due.student_id,
      type: w.type,
      key: w.key,
      lang: s.language,
      to: st.parent_phone,
      ctx: {
        parent: st.parent_name,
        institute: inst,
        student: st.name,
        amount: rupees(w.owe),
        period: periodText(w.due.period, s.language),
        dueDate: ymdText(w.due.due_date, s.language),
        since: ymdText(w.due.due_date, s.language),
        ...(paidLinks
          ? { paidLink: paidUrl(paidLinks.baseUrl, paidLinks.secret, w.due.student_id) }
          : {}),
      },
    });
  }
  let n = 0;
  for (let i = 0; i < items.length; i += 500)
    n += await queue(pool, instituteId, items.slice(i, i + 500), now);
  return n;
}

/** The daily job for every institute that has messages on and an active plan. Returns the total queued. */
export async function enqueueAllFeeReminders(
  pool: Pool,
  now: Date,
  paidLinks?: { baseUrl: string; secret: string },
): Promise<number> {
  const [rows] = (await pool.query(
    "SELECT n.institute_id FROM notify_settings n JOIN subscriptions s ON s.institute_id = n.institute_id WHERE n.enabled = 1 AND s.status = 'active' AND s.expires_at > ?",
    [now],
  )) as unknown as [{ institute_id: string }[]];
  let total = 0;
  for (const r of rows) total += await enqueueFeeReminders(pool, r.institute_id, now, paidLinks);
  return total;
}
