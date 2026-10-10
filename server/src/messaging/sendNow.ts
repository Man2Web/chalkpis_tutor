import type { Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { payQrPath } from './payQr.js';
import { periodText, rupees, varsFor, type MessageContext, type MessageType } from './templates.js';

/** The same message to the same parent at most once in this window, so a double tap never sends twice. */
const WINDOW_MS = 10 * 60_000;

export interface SendNowConfig {
  /** Public address of this server; needed for the QR picture WhatsApp downloads. */
  publicBaseUrl?: string;
  /** Secret used to sign QR picture links. */
  secret: string;
}

interface StudentRow {
  id: string;
  name: string;
  parent_phone: string;
  status: string;
}

async function student(pool: Pool, instituteId: string, id: string): Promise<StudentRow> {
  const [rows] = (await pool.query(
    'SELECT id, name, parent_phone, status FROM students WHERE institute_id = ? AND id = ?',
    [instituteId, id],
  )) as unknown as [StudentRow[]];
  const s = rows[0];
  if (!s) throw notFound();
  if (s.status !== 'active') throw new AppError(409, 'student_inactive');
  return s;
}

/**
 * Queues a message the tutor asked to send now. It goes out even when automatic messages are switched off.
 * A repeat within 10 minutes is refused with `recently_sent`.
 */
async function queueManual(
  pool: Pool,
  instituteId: string,
  s: StudentRow,
  type: MessageType,
  ctx: MessageContext,
  now: Date,
  mediaUrl?: string,
): Promise<{ id: string }> {
  const id = newId();
  const key = `now_${type}_${s.id}_${Math.floor(now.getTime() / WINDOW_MS)}`;
  const [res] = (await pool.query(
    `INSERT IGNORE INTO messages (id, institute_id, student_id, type, dedupe_key, lang, manual, to_last4, vars, media_url, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, 'en', 1, ?, ?, ?, ?)`,
    [
      id,
      instituteId,
      s.id,
      type,
      key,
      s.parent_phone.slice(-4),
      JSON.stringify(varsFor(type, ctx)),
      mediaUrl ?? null,
      now,
    ],
  )) as unknown as [{ affectedRows: number }];
  if (!res.affectedRows) throw new AppError(409, 'recently_sent');
  return { id };
}

async function institute(pool: Pool, id: string) {
  const [rows] = (await pool.query(
    'SELECT name, upi_id, payment_link FROM institutes WHERE id = ?',
    [id],
  )) as unknown as [{ name: string; upi_id: string; payment_link: string }[]];
  return rows[0]!;
}

/**
 * Fee reminder sent now: with the tutor's payment link if they set one, otherwise with a picture of their UPI QR
 * for the exact amount, otherwise as a plain overdue reminder. Returns which kind went out.
 */
export async function sendFeeReminderNow(
  pool: Pool,
  cfg: SendNowConfig,
  instituteId: string,
  studentId: string,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const s = await student(pool, instituteId, studentId);
  const [dues] = (await pool.query(
    `SELECT period, GREATEST(CAST(amount AS SIGNED) - CAST(discount AS SIGNED) - CAST(paid AS SIGNED), 0) AS owe
       FROM fee_dues WHERE institute_id = ? AND student_id = ? AND status IN ('pending','partial')
      ORDER BY period`,
    [instituteId, studentId],
  )) as unknown as [{ period: string; owe: number }[]];
  const owing = dues.filter((d) => Number(d.owe) > 0);
  const total = owing.reduce((t, d) => t + Number(d.owe), 0);
  if (!total) throw new AppError(409, 'nothing_due');
  const first = periodText(owing[0]!.period, 'en');
  const last = periodText(owing[owing.length - 1]!.period, 'en');
  const inst = await institute(pool, instituteId);
  const ctx: MessageContext = {
    parent: '',
    student: s.name,
    institute: inst.name,
    amount: rupees(total),
    period: first === last ? first : `${first} to ${last}`,
    since: first,
    link: inst.payment_link,
  };
  if (inst.payment_link) {
    await queueManual(pool, instituteId, s, 'fee_link', ctx, now);
    return { kind: 'link' as const, amount: total };
  }
  if (inst.upi_id && cfg.publicBaseUrl) {
    const media = `${cfg.publicBaseUrl}${payQrPath(cfg.secret, {
      pa: inst.upi_id,
      pn: inst.name,
      am: total,
      tn: `${s.name} fee`.slice(0, 50),
    })}`;
    await queueManual(pool, instituteId, s, 'fee_reminder', ctx, now, media);
    return { kind: 'qr' as const, amount: total };
  }
  await queueManual(pool, instituteId, s, 'fee_overdue', ctx, now);
  return { kind: 'text' as const, amount: total };
}

/** Sends the private parent page link to the parent on WhatsApp. */
export async function sendParentLinkNow(
  pool: Pool,
  instituteId: string,
  studentId: string,
  url: string,
  now: Date,
) {
  const s = await student(pool, instituteId, studentId);
  const inst = await institute(pool, instituteId);
  return queueManual(
    pool,
    instituteId,
    s,
    'parent_link',
    { parent: '', student: s.name, institute: inst.name, link: url },
    now,
  );
}

/** Sends a payment's receipt (thank-you) to the parent again. Reversals and reversed payments are refused. */
export async function sendReceiptNow(
  pool: Pool,
  instituteId: string,
  paymentId: string,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const [rows] = (await pool.query(
    `SELECT p.student_id, p.amount, p.receipt_no, p.balance_after,
            EXISTS (SELECT 1 FROM payments r WHERE r.institute_id = p.institute_id AND r.reversal_of = p.id) AS reversed
       FROM payments p WHERE p.institute_id = ? AND p.id = ?`,
    [instituteId, paymentId],
  )) as unknown as [
    {
      student_id: string;
      amount: number;
      receipt_no: string | null;
      balance_after: number;
      reversed: number;
    }[],
  ];
  const p = rows[0];
  if (!p) throw notFound();
  if (Number(p.amount) <= 0 || p.reversed) throw new AppError(409, 'not_sendable');
  const s = await student(pool, instituteId, p.student_id);
  const inst = await institute(pool, instituteId);
  return queueManual(
    pool,
    instituteId,
    s,
    'payment_received',
    {
      parent: '',
      student: s.name,
      institute: inst.name,
      amount: rupees(Number(p.amount)),
      receiptNo: p.receipt_no ?? '-',
      balance: rupees(Number(p.balance_after ?? 0)),
    },
    now,
  );
}
