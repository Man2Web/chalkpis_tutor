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
    language: r.language,
  };
}

export async function saveSettings(pool: Pool, instituteId: string, s: NotifySettings, now: Date) {
  await requireActivePlan(pool, instituteId, now);
  await pool.query(
    `INSERT INTO notify_settings (institute_id, enabled, absent, late, fee_due, fee_due_days_before, fee_overdue, overdue_every_days, payment_received, language)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), absent = VALUES(absent), late = VALUES(late), fee_due = VALUES(fee_due),
       fee_due_days_before = VALUES(fee_due_days_before), fee_overdue = VALUES(fee_overdue), overdue_every_days = VALUES(overdue_every_days),
       payment_received = VALUES(payment_received), language = VALUES(language)`,
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

/**
 * Daily run for one institute: "due soon" and "overdue" reminders. Safe to run twice in a day (the keys dedupe).
 * Does nothing when the plan has ended or the owner has not switched messages on.
 */
export async function enqueueFeeReminders(
  pool: Pool,
  instituteId: string,
  now: Date,
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
      },
    });
  }
  let n = 0;
  for (let i = 0; i < items.length; i += 500)
    n += await queue(pool, instituteId, items.slice(i, i + 500), now);
  return n;
}

/** The daily job for every institute that has messages on and an active plan. Returns the total queued. */
export async function enqueueAllFeeReminders(pool: Pool, now: Date): Promise<number> {
  const [rows] = (await pool.query(
    "SELECT n.institute_id FROM notify_settings n JOIN subscriptions s ON s.institute_id = n.institute_id WHERE n.enabled = 1 AND s.status = 'active' AND s.expires_at > ?",
    [now],
  )) as unknown as [{ institute_id: string }[]];
  let total = 0;
  for (const r of rows) total += await enqueueFeeReminders(pool, r.institute_id, now);
  return total;
}
