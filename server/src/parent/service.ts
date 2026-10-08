import { randomBytes } from 'node:crypto';
import { notFound } from '../errors.js';
import type { Pool } from '../db.js';
import { logoUrl } from '../routes/files.js';
import { requireActivePlan } from '../institutes/limits.js';
import { sha256 } from '../lib/ids.js';
import { addDays, todayYmd, ymdOf } from '../lib/ist.js';
import { netDue, outstanding, type DueStatus } from '../fees/logic.js';
import { toStat } from '../attendance/stats.js';

export const DEFAULT_LINK_DAYS = 30;
export const MAX_LINK_DAYS = 90;

/** Only this hash is stored; the token itself exists in the link and nowhere else. */
export const hashToken = (token: string) => sha256(token);
/** 256 random bits, URL-safe. Unguessable: nobody can stumble onto another family's page. */
export const newToken = () => randomBytes(32).toString('base64url');
/** Tokens we hand out look like this; anything else is rejected before touching the database. */
export const looksLikeToken = (t: unknown): t is string =>
  typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export async function createParentLink(
  pool: Pool,
  a: { instituteId: string; studentId: string; createdBy: string; days: number },
  now: Date,
) {
  await requireActivePlan(pool, a.instituteId, now);
  const [s] = (await pool.query('SELECT 1 FROM students WHERE institute_id = ? AND id = ?', [
    a.instituteId,
    a.studentId,
  ])) as unknown as [unknown[]];
  if (!s.length) throw notFound();
  const token = newToken();
  const expiresAt = new Date(
    now.getTime() + Math.min(MAX_LINK_DAYS, Math.max(1, a.days)) * 86_400_000,
  );
  await pool.query(
    'INSERT INTO parent_links (token_hash, institute_id, student_id, created_by, expires_at) VALUES (?, ?, ?, ?, ?)',
    [hashToken(token), a.instituteId, a.studentId, a.createdBy, expiresAt],
  );
  return { token, expiresAt };
}

/** Switches off every link of a student. Returns how many were active. */
export async function revokeParentLinks(
  pool: Pool,
  instituteId: string,
  studentId: string,
): Promise<number> {
  const [s] = (await pool.query('SELECT 1 FROM students WHERE institute_id = ? AND id = ?', [
    instituteId,
    studentId,
  ])) as unknown as [unknown[]];
  if (!s.length) throw notFound();
  const [res] = (await pool.query(
    'UPDATE parent_links SET revoked = 1 WHERE institute_id = ? AND student_id = ? AND revoked = 0',
    [instituteId, studentId],
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}

/** How many links work right now, and when the latest one ends. */
export async function parentLinkStatus(
  pool: Pool,
  instituteId: string,
  studentId: string,
  now: Date,
) {
  const [s] = (await pool.query('SELECT 1 FROM students WHERE institute_id = ? AND id = ?', [
    instituteId,
    studentId,
  ])) as unknown as [unknown[]];
  if (!s.length) throw notFound();
  const [rows] = (await pool.query(
    'SELECT COUNT(*) AS n, MAX(expires_at) AS latest FROM parent_links WHERE institute_id = ? AND student_id = ? AND revoked = 0 AND expires_at > ?',
    [instituteId, studentId, now],
  )) as unknown as [{ n: number; latest: Date | null }[]];
  return {
    active: Number(rows[0]!.n),
    latestExpiresAt: rows[0]!.latest ? rows[0]!.latest.toISOString() : null,
  };
}

type Mark = 'P' | 'A' | 'L';

/**
 * Everything one parent link may show: that student's last 30 days of attendance, their fees and recent receipts.
 * Null for an unknown, expired or revoked link (all look the same from outside). Never includes phone numbers of
 * parents or students, notes, or anything about other students.
 */
export async function buildParentView(
  pool: Pool,
  token: unknown,
  now: Date,
  publicBase: string | undefined,
) {
  if (!looksLikeToken(token)) return null;
  const [links] = (await pool.query(
    'SELECT institute_id, student_id, revoked, expires_at FROM parent_links WHERE token_hash = ?',
    [hashToken(token)],
  )) as unknown as [
    { institute_id: string; student_id: string; revoked: number; expires_at: Date }[],
  ];
  const link = links[0];
  if (!link || link.revoked || link.expires_at.getTime() <= now.getTime()) return null;
  const { institute_id: inst, student_id: sid } = link;

  const [[row]] = (await pool.query(
    'SELECT i.name, i.phone, i.logo_path, s.name AS student_name, s.class FROM institutes i JOIN students s ON s.institute_id = i.id WHERE i.id = ? AND s.id = ?',
    [inst, sid],
  )) as unknown as [
    [
      | {
          name: string;
          phone: string;
          logo_path: string | null;
          student_name: string;
          class: string;
        }
      | undefined,
    ],
  ];
  if (!row) return null;

  const today = todayYmd(now);
  const [att] = (await pool.query(
    `SELECT DATE_FORMAT(a.day, '%Y-%m-%d') AS day, m.mark FROM attendance_marks m
       JOIN attendance_days a ON a.institute_id = m.institute_id AND a.id = m.day_id
      WHERE m.institute_id = ? AND m.student_id = ? AND a.holiday IS NULL AND a.day >= ? AND a.day <= ?
      ORDER BY a.day DESC, a.batch_id LIMIT 30`,
    [inst, sid, addDays(today, -30), today],
  )) as unknown as [{ day: string; mark: Mark }[]];
  const count = (m: Mark) => att.filter((d) => d.mark === m).length;
  const stat = toStat(count('P'), count('L'), count('A'));

  const [dues] = (await pool.query(
    `SELECT description, period, amount, discount, paid, status, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
       FROM fee_dues WHERE institute_id = ? AND student_id = ? ORDER BY period DESC, due_date DESC LIMIT 12`,
    [inst, sid],
  )) as unknown as [
    {
      description: string;
      period: string;
      amount: number;
      discount: number;
      paid: number;
      status: DueStatus;
      due_date: string;
    }[],
  ];
  const items = dues.map((d) => {
    const m = {
      amount: Number(d.amount),
      discount: Number(d.discount),
      paid: Number(d.paid),
      status: d.status,
    };
    return {
      description: d.description,
      period: d.period,
      net: netDue(m),
      paid: m.paid,
      outstanding: outstanding(m),
      status: d.status,
      dueDate: d.due_date,
    };
  });

  const [pays] = (await pool.query(
    `SELECT p.receipt_no, p.amount, p.mode, p.paid_at FROM payments p
      WHERE p.institute_id = ? AND p.student_id = ? AND p.amount > 0 AND p.receipt_no IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM payments r WHERE r.institute_id = p.institute_id AND r.reversal_of = p.id)
      ORDER BY p.paid_at DESC, p.id LIMIT 8`,
    [inst, sid],
  )) as unknown as [{ receipt_no: string; amount: number; mode: string; paid_at: Date }[]];

  return {
    institute: { name: row.name, logoUrl: logoUrl(publicBase, row.logo_path), phone: row.phone },
    student: { name: row.student_name, className: row.class },
    attendance: {
      pct: stat.pct,
      present: stat.present,
      late: stat.late,
      absent: stat.absent,
      days: att.map((d) => ({ date: d.day, mark: d.mark })),
    },
    fees: { outstanding: items.reduce((t, d) => t + d.outstanding, 0), items },
    payments: pays.map((p) => ({
      receiptNo: p.receipt_no,
      amount: Number(p.amount),
      date: ymdOf(p.paid_at),
      mode: p.mode,
    })),
    expiresAt: link.expires_at.toISOString(),
  };
}
