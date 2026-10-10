import { AppError, notFound } from '../errors.js';
import { withTransaction, type Pool, type PoolConnection } from '../db.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { enqueuePayment } from '../messaging/notify.js';
import { isRealDate, paidAtFor, todayYmd, ymdOf } from '../lib/ist.js';
import {
  applyPayment,
  applyReversal,
  discountError,
  dueDateFor,
  descriptionFor,
  formatReceiptNo,
  isDueInPeriod,
  netDue,
  outstanding,
  statusFor,
  type DueStatus,
  type FeeCycle,
} from './logic.js';

type Db = Pool | PoolConnection;

interface DueRow {
  id: string;
  student_id: string;
  batch_id: string | null;
  period: string;
  amount: number;
  discount: number;
  paid: number;
  status: DueStatus;
  due_date: string;
  description: string;
  kind: 'regular' | 'charge';
  waived_note: string;
}
const DUE_COLS =
  "d.id, d.student_id, d.batch_id, d.period, d.amount, d.discount, d.paid, d.status, DATE_FORMAT(d.due_date, '%Y-%m-%d') AS due_date, d.description, d.kind, d.waived_note";

const money = (r: Pick<DueRow, 'amount' | 'discount' | 'paid' | 'status'>) => ({
  amount: Number(r.amount),
  discount: Number(r.discount),
  paid: Number(r.paid),
  status: r.status,
});

export const toDue = (r: DueRow, today: string) => {
  const m = money(r);
  const owe = outstanding(m);
  return {
    id: r.id,
    studentId: r.student_id,
    batchId: r.batch_id,
    period: r.period,
    ...m,
    net: netDue(m),
    outstanding: owe,
    dueDate: r.due_date,
    overdue: owe > 0 && r.due_date < today,
    description: r.description,
    kind: r.kind,
    waivedNote: r.waived_note,
  };
};

async function lockDue(c: PoolConnection, instituteId: string, id: string): Promise<DueRow> {
  const [rows] = (await c.query(
    `SELECT ${DUE_COLS} FROM fee_dues d WHERE d.institute_id = ? AND d.id = ? FOR UPDATE`,
    [instituteId, id],
  )) as unknown as [DueRow[]];
  if (!rows[0]) throw notFound();
  return rows[0];
}

/**
 * Creates the missing regular dues for all active students of one institute for one period. Safe to run again and
 * again: the unique due_key means existing dues are never touched and never duplicated, and a student who joined
 * after the last run still gets theirs. Returns how many were created.
 */
const maxYmd = (a: string, b: string) => (a >= b ? a : b);

export async function generateDues(db: Db, instituteId: string, period: string): Promise<number> {
  const [students] = (await db.query(
    `SELECT s.id, s.monthly_fee, s.fee_cycle, s.due_day, s.discount, s.joined_at,
            (SELECT MIN(sb.batch_id) FROM student_batches sb WHERE sb.institute_id = s.institute_id AND sb.student_id = s.id) AS batch_id
       FROM students s WHERE s.institute_id = ? AND s.status = 'active' AND s.monthly_fee > 0`,
    [instituteId],
  )) as unknown as [
    {
      id: string;
      monthly_fee: number;
      fee_cycle: FeeCycle;
      due_day: number;
      discount: number;
      joined_at: Date;
      batch_id: string | null;
    }[],
  ];
  const rows: unknown[][] = [];
  for (const s of students) {
    if (!isDueInPeriod(s.fee_cycle, ymdOf(s.joined_at).slice(0, 7), period)) continue;
    const amount = Number(s.monthly_fee) * (s.fee_cycle === 'quarterly' ? 3 : 1);
    rows.push([
      newId(),
      instituteId,
      s.id,
      s.batch_id,
      period,
      amount,
      Math.min(Number(s.discount), amount),
      // never due before the student joined (a mid-month joiner is not overdue on day one)
      maxYmd(dueDateFor(period, s.due_day), ymdOf(s.joined_at)),
      descriptionFor(s.fee_cycle),
      `${s.id}_${period}`,
    ]);
  }
  let created = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const [res] = (await db.query(
      `INSERT IGNORE INTO fee_dues (id, institute_id, student_id, batch_id, period, amount, discount, due_date, description, due_key) VALUES ?`,
      [rows.slice(i, i + 500)],
    )) as unknown as [{ affectedRows: number }];
    created += res.affectedRows;
  }
  // A discount as big as the fee leaves nothing to pay: such a due is born paid.
  await db.query(
    "UPDATE fee_dues SET status = 'paid' WHERE institute_id = ? AND period = ? AND status = 'pending' AND amount = discount",
    [instituteId, period],
  );
  return created;
}

export async function getDue(db: Db, instituteId: string, id: string, now: Date) {
  const [rows] = (await db.query(
    `SELECT ${DUE_COLS} FROM fee_dues d WHERE d.institute_id = ? AND d.id = ?`,
    [instituteId, id],
  )) as unknown as [DueRow[]];
  if (!rows[0]) throw notFound();
  return toDue(rows[0], todayYmd(now));
}

export async function listDues(
  db: Db,
  instituteId: string,
  q: { studentId?: string; period?: string; status: 'open' | 'all'; limit: number; offset: number },
  now: Date,
) {
  const where = ['d.institute_id = ?'];
  const args: unknown[] = [instituteId];
  if (q.studentId) {
    where.push('d.student_id = ?');
    args.push(q.studentId);
  }
  if (q.period) {
    where.push('d.period = ?');
    args.push(q.period);
  }
  if (q.status === 'open') where.push("d.status IN ('pending','partial')");
  const [rows] = (await db.query(
    `SELECT ${DUE_COLS} FROM fee_dues d WHERE ${where.join(' AND ')} ORDER BY d.due_date, d.id LIMIT ? OFFSET ?`,
    [...args, q.limit, q.offset],
  )) as unknown as [DueRow[]];
  const today = todayYmd(now);
  return rows.map((r) => toDue(r, today));
}

/** Everyone who owes money, one line per student, overdue first, then oldest, then biggest. */
export async function feesOverview(db: Db, instituteId: string, now: Date) {
  const today = todayYmd(now);
  const [rows] = (await db.query(
    `SELECT d.student_id, s.name,
            SUM(GREATEST(CAST(d.amount AS SIGNED) - CAST(d.discount AS SIGNED) - CAST(d.paid AS SIGNED), 0)) AS owed,
            SUM(IF(d.due_date < ?, GREATEST(CAST(d.amount AS SIGNED) - CAST(d.discount AS SIGNED) - CAST(d.paid AS SIGNED), 0), 0)) AS overdue_amount,
            DATE_FORMAT(MIN(d.due_date), '%Y-%m-%d') AS oldest, COUNT(*) AS dues
       FROM fee_dues d JOIN students s ON s.institute_id = d.institute_id AND s.id = d.student_id
      WHERE d.institute_id = ? AND d.status IN ('pending','partial')
      GROUP BY d.student_id, s.name HAVING owed > 0`,
    [today, instituteId],
  )) as unknown as [
    {
      student_id: string;
      name: string;
      owed: number;
      overdue_amount: number;
      oldest: string;
      dues: number;
    }[],
  ];
  const students = rows
    .map((r) => ({
      studentId: r.student_id,
      name: r.name,
      outstanding: Number(r.owed),
      overdueAmount: Number(r.overdue_amount),
      oldestDueDate: r.oldest,
      dues: Number(r.dues),
      overdue: Number(r.overdue_amount) > 0,
    }))
    .sort(
      (a, b) =>
        Number(b.overdue) - Number(a.overdue) ||
        a.oldestDueDate.localeCompare(b.oldestDueDate) ||
        b.outstanding - a.outstanding ||
        a.studentId.localeCompare(b.studentId),
    );
  return {
    students,
    totals: {
      outstanding: students.reduce((s, g) => s + g.outstanding, 0),
      overdueAmount: students.reduce((s, g) => s + g.overdueAmount, 0),
      students: students.length,
      overdueStudents: students.filter((g) => g.overdue).length,
    },
  };
}

export interface PaymentInput {
  amount: number;
  mode: 'cash' | 'upi' | 'bank' | 'other';
  paidOn?: string;
  note: string;
}

const PAY_ERRORS = {
  amount: new AppError(400, 'bad_amount'),
  exceeds: new AppError(409, 'exceeds_balance'),
  waived: new AppError(409, 'due_waived'),
} as const;

/**
 * Records a payment: takes the next receipt number, writes the (append-only) payment and updates the due, all in
 * one transaction. The due and the institute row are locked, so two devices can never share a receipt number
 * and two payments can never together pay more than is owed.
 */
export async function recordPayment(
  pool: Pool,
  instituteId: string,
  userId: string,
  dueId: string,
  p: PaymentInput,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  if (p.paidOn && (p.paidOn > todayYmd(now) || !isRealDate(p.paidOn)))
    throw new AppError(400, 'bad_date');
  const paidAt = paidAtFor(p.paidOn ?? todayYmd(now), now);
  return withTransaction(pool, async (c) => {
    const due = await lockDue(c, instituteId, dueId);
    const r = await insertPayment(c, instituteId, userId, due, p.amount, p.mode, paidAt, p.note);
    await enqueuePayment(
      c,
      instituteId,
      {
        paymentId: r.paymentId,
        studentId: due.student_id,
        amount: p.amount,
        receiptNo: r.receiptNo,
        balanceAfter: r.balanceAfter,
      },
      now,
    );
    return r;
  });
}

/** Writes one payment against a due the caller has locked, with the next receipt number. Inside a transaction. */
async function insertPayment(
  c: PoolConnection,
  instituteId: string,
  userId: string,
  due: DueRow,
  amount: number,
  mode: PaymentInput['mode'],
  paidAt: Date,
  note: string,
) {
  const result = applyPayment(money(due), amount);
  if ('error' in result) throw PAY_ERRORS[result.error];
  const [inst] = (await c.query(
    'SELECT receipt_prefix, next_receipt_no FROM institutes WHERE id = ? FOR UPDATE',
    [instituteId],
  )) as unknown as [{ receipt_prefix: string; next_receipt_no: number }[]];
  const seq = Number(inst[0]!.next_receipt_no);
  const receiptNo = formatReceiptNo(inst[0]!.receipt_prefix, seq);
  const balanceAfter = Math.max(0, netDue(money(due)) - result.paid);
  const id = newId();
  await c.query(
    `INSERT INTO payments (id, institute_id, student_id, due_id, batch_id, amount, mode, paid_at, receipt_no, note, recorded_by, balance_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      instituteId,
      due.student_id,
      due.id,
      due.batch_id,
      amount,
      mode,
      paidAt,
      receiptNo,
      note,
      userId,
      balanceAfter,
    ],
  );
  await c.query('UPDATE fee_dues SET paid = ?, status = ? WHERE institute_id = ? AND id = ?', [
    result.paid,
    result.status,
    instituteId,
    due.id,
  ]);
  await c.query('UPDATE institutes SET next_receipt_no = ? WHERE id = ?', [seq + 1, instituteId]);
  return { paymentId: id, receiptNo, balanceAfter, status: result.status };
}

const ADVANCE_ERRORS = {
  student: new AppError(409, 'student_not_billable'),
  month: new AppError(400, 'bad_month'),
  nothing: new AppError(409, 'already_paid'),
} as const;

/** Months a student can pay ahead: this month and up to 12 after it. */
export const ADVANCE_MONTHS = 12;

const addMonths = (period: string, n: number) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * A parent pays several months at once. In one transaction: create each month's regular due if it does not exist yet
 * (same amount, discount and due date the monthly job would use), then pay what is left on each in full, one receipt
 * per month. Months already paid are skipped; one parent message is queued for the total.
 */
export async function recordAdvance(
  pool: Pool,
  instituteId: string,
  userId: string,
  a: {
    studentId: string;
    months: string[];
    mode: PaymentInput['mode'];
    paidOn?: string;
    note: string;
  },
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const today = todayYmd(now);
  if (a.paidOn && (a.paidOn > today || !isRealDate(a.paidOn))) throw new AppError(400, 'bad_date');
  const paidAt = paidAtFor(a.paidOn ?? today, now);
  const first = today.slice(0, 7);
  const last = addMonths(first, ADVANCE_MONTHS);
  const months = [...new Set(a.months)].sort();
  if (!months.length || months.some((m) => m < first || m > last)) throw ADVANCE_ERRORS.month;

  return withTransaction(pool, async (c) => {
    const [rows] = (await c.query(
      `SELECT s.id, s.status, s.monthly_fee, s.fee_cycle, s.due_day, s.discount, s.joined_at,
              (SELECT MIN(sb.batch_id) FROM student_batches sb WHERE sb.institute_id = s.institute_id AND sb.student_id = s.id) AS batch_id
         FROM students s WHERE s.institute_id = ? AND s.id = ? FOR UPDATE`,
      [instituteId, a.studentId],
    )) as unknown as [
      {
        id: string;
        status: string;
        monthly_fee: number;
        fee_cycle: FeeCycle;
        due_day: number;
        discount: number;
        joined_at: Date;
        batch_id: string | null;
      }[],
    ];
    const s = rows[0];
    if (!s) throw notFound();
    if (s.status !== 'active' || Number(s.monthly_fee) <= 0 || s.fee_cycle !== 'monthly')
      throw ADVANCE_ERRORS.student;
    const joined = ymdOf(s.joined_at);
    if (months.some((m) => !isDueInPeriod(s.fee_cycle, joined.slice(0, 7), m)))
      throw ADVANCE_ERRORS.month;

    const paid: { period: string; paymentId: string; receiptNo: string; amount: number }[] = [];
    for (const period of months) {
      const amount = Number(s.monthly_fee);
      await c.query(
        `INSERT IGNORE INTO fee_dues (id, institute_id, student_id, batch_id, period, amount, discount, due_date, description, due_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          instituteId,
          s.id,
          s.batch_id,
          period,
          amount,
          Math.min(Number(s.discount), amount),
          maxYmd(dueDateFor(period, s.due_day), joined),
          descriptionFor(s.fee_cycle),
          `${s.id}_${period}`,
        ],
      );
      const [d] = (await c.query(
        `SELECT ${DUE_COLS} FROM fee_dues d WHERE d.institute_id = ? AND d.due_key = ? FOR UPDATE`,
        [instituteId, `${s.id}_${period}`],
      )) as unknown as [DueRow[]];
      const due = d[0]!;
      const owe = due.status === 'waived' ? 0 : outstanding(money(due));
      if (owe <= 0) continue;
      const r = await insertPayment(c, instituteId, userId, due, owe, a.mode, paidAt, a.note);
      paid.push({ period, paymentId: r.paymentId, receiptNo: r.receiptNo, amount: owe });
    }
    if (!paid.length) throw ADVANCE_ERRORS.nothing;
    const total = paid.reduce((t, p) => t + p.amount, 0);
    await enqueuePayment(
      c,
      instituteId,
      {
        paymentId: paid[0]!.paymentId,
        studentId: s.id,
        amount: total,
        receiptNo: paid.map((p) => p.receiptNo).join(', '),
        balanceAfter: 0,
      },
      now,
    );
    return { payments: paid, total };
  });
}

/** Corrects a payment with a negative entry. A payment can be reversed once, even if two requests race. */
export async function reversePayment(
  pool: Pool,
  instituteId: string,
  userId: string,
  paymentId: string,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  try {
    return await withTransaction(pool, async (c) => {
      const [pays] = (await c.query(
        'SELECT student_id, due_id, batch_id, amount, mode, reversal_of FROM payments WHERE institute_id = ? AND id = ? FOR UPDATE',
        [instituteId, paymentId],
      )) as unknown as [
        {
          student_id: string;
          due_id: string;
          batch_id: string | null;
          amount: number;
          mode: string;
          reversal_of: string | null;
        }[],
      ];
      const pay = pays[0];
      if (!pay) throw notFound();
      if (Number(pay.amount) <= 0 || pay.reversal_of) throw new AppError(409, 'not_reversible');
      const due = await lockDue(c, instituteId, pay.due_id);
      const r = applyReversal(money(due), Number(pay.amount));
      const id = newId();
      await c.query(
        `INSERT INTO payments (id, institute_id, student_id, due_id, batch_id, amount, mode, paid_at, note, recorded_by, reversal_of)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
        [
          id,
          instituteId,
          pay.student_id,
          pay.due_id,
          pay.batch_id,
          -Number(pay.amount),
          pay.mode,
          now,
          userId,
          paymentId,
        ],
      );
      await c.query('UPDATE fee_dues SET paid = ?, status = ? WHERE institute_id = ? AND id = ?', [
        r.paid,
        r.status,
        instituteId,
        pay.due_id,
      ]);
      return { reversalId: id, status: r.status };
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
      throw new AppError(409, 'already_reversed');
    throw e;
  }
}

export async function addCharge(
  pool: Pool,
  instituteId: string,
  c: { studentId: string; description: string; amount: number; dueDate: string },
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const [s] = (await pool.query('SELECT 1 FROM students WHERE institute_id = ? AND id = ?', [
    instituteId,
    c.studentId,
  ])) as unknown as [unknown[]];
  if (!s.length) throw new AppError(400, 'unknown_student');
  const id = newId();
  await pool.query(
    `INSERT INTO fee_dues (id, institute_id, student_id, period, amount, due_date, description, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'charge')`,
    [id, instituteId, c.studentId, todayYmd(now).slice(0, 7), c.amount, c.dueDate, c.description],
  );
  return id;
}

async function changeDue(
  pool: Pool,
  instituteId: string,
  dueId: string,
  now: Date,
  fn: (due: DueRow) => { sql: string; args: unknown[] },
) {
  await requireActivePlan(pool, instituteId, now);
  await withTransaction(pool, async (c) => {
    const due = await lockDue(c, instituteId, dueId);
    const { sql, args } = fn(due);
    await c.query(`UPDATE fee_dues SET ${sql} WHERE institute_id = ? AND id = ?`, [
      ...args,
      instituteId,
      dueId,
    ]);
  });
}

export const setDiscount = (
  pool: Pool,
  instituteId: string,
  dueId: string,
  discount: number,
  now: Date,
) =>
  changeDue(pool, instituteId, dueId, now, (d) => {
    const err = discountError({ amount: Number(d.amount), paid: Number(d.paid) }, discount);
    if (err) throw new AppError(400, err === 'amount' ? 'bad_amount' : 'discount_too_big');
    const status = statusFor(Number(d.amount), discount, Number(d.paid), d.status === 'waived');
    return { sql: 'discount = ?, status = ?', args: [discount, status] };
  });

/** Waive forgives the remaining balance; un-waiving recomputes the status from the money. */
export const setWaived = (
  pool: Pool,
  instituteId: string,
  dueId: string,
  waived: boolean,
  note: string,
  now: Date,
) =>
  changeDue(pool, instituteId, dueId, now, (d) => ({
    sql: 'status = ?, waived_note = ?',
    args: [
      statusFor(Number(d.amount), Number(d.discount), Number(d.paid), waived),
      waived ? note : '',
    ],
  }));

const PAY_COLS = `p.id, p.student_id, s.name AS student_name, p.due_id, p.batch_id, p.amount, p.mode, p.paid_at, p.receipt_no, p.note,
  p.balance_after, p.reversal_of, EXISTS (SELECT 1 FROM payments r WHERE r.institute_id = p.institute_id AND r.reversal_of = p.id) AS reversed`;

interface PayRow {
  id: string;
  student_id: string;
  student_name: string;
  due_id: string;
  batch_id: string | null;
  amount: number;
  mode: string;
  paid_at: Date;
  receipt_no: string | null;
  note: string;
  balance_after: number | null;
  reversal_of: string | null;
  reversed: number;
}
const toPayment = (r: PayRow) => ({
  id: r.id,
  studentId: r.student_id,
  studentName: r.student_name,
  dueId: r.due_id,
  batchId: r.batch_id,
  amount: Number(r.amount),
  mode: r.mode,
  paidAt: r.paid_at.toISOString(),
  paidOn: ymdOf(r.paid_at),
  receiptNo: r.receipt_no,
  note: r.note,
  balanceAfter: r.balance_after === null ? null : Number(r.balance_after),
  reversalOf: r.reversal_of,
  reversed: !!r.reversed,
});

export async function listPayments(
  db: Db,
  instituteId: string,
  q: { studentId?: string; from?: string; to?: string; limit: number; offset: number },
) {
  const where = ['p.institute_id = ?'];
  const args: unknown[] = [instituteId];
  if (q.studentId) {
    where.push('p.student_id = ?');
    args.push(q.studentId);
  }
  if (q.from) {
    where.push('p.paid_at >= ?');
    args.push(new Date(`${q.from}T00:00:00+05:30`));
  }
  if (q.to) {
    where.push('p.paid_at < ?');
    args.push(new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000));
  }
  const [rows] = (await db.query(
    `SELECT ${PAY_COLS} FROM payments p JOIN students s ON s.institute_id = p.institute_id AND s.id = p.student_id
      WHERE ${where.join(' AND ')} ORDER BY p.paid_at DESC, p.id LIMIT ? OFFSET ?`,
    [...args, q.limit, q.offset],
  )) as unknown as [PayRow[]];
  return rows.map(toPayment);
}

/** One payment with everything a receipt shows. */
export async function getPayment(db: Db, instituteId: string, id: string) {
  const [rows] = (await db.query(
    `SELECT ${PAY_COLS}, dd.description AS due_description, dd.period AS due_period
       FROM payments p JOIN students s ON s.institute_id = p.institute_id AND s.id = p.student_id
       JOIN fee_dues dd ON dd.institute_id = p.institute_id AND dd.id = p.due_id
      WHERE p.institute_id = ? AND p.id = ?`,
    [instituteId, id],
  )) as unknown as [(PayRow & { due_description: string; due_period: string })[]];
  const r = rows[0];
  if (!r) throw notFound();
  const [inst] = (await db.query('SELECT name, address, phone FROM institutes WHERE id = ?', [
    instituteId,
  ])) as unknown as [{ name: string; address: string; phone: string }[]];
  return {
    ...toPayment(r),
    dueDescription: r.due_description,
    duePeriod: r.due_period,
    institute: { name: inst[0]!.name, address: inst[0]!.address, phone: inst[0]!.phone },
  };
}
