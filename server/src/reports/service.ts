import { AppError } from '../errors.js';
import type { Pool, PoolConnection } from '../db.js';
import { feesOverview } from '../fees/service.js';
import { addDays, daysBetween, todayYmd, weekdayOf } from '../lib/ist.js';
import { toStat } from '../attendance/stats.js';

type Db = Pool | PoolConnection;

const istStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
const nextMonthStart = (period: string) => {
  const [y, m] = period.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1) - 330 * 60_000); // IST midnight on the 1st of next month
};

/** What the tutor sees on opening the app: today's classes, money owed, money collected this month. */
export async function dashboard(db: Db, instituteId: string, now: Date) {
  const today = todayYmd(now);
  const month = today.slice(0, 7);
  const [[counts]] = (await db.query(
    `SELECT (SELECT COUNT(*) FROM students WHERE institute_id = ? AND status = 'active') AS students,
            (SELECT COUNT(*) FROM batches WHERE institute_id = ? AND status = 'active') AS batches`,
    [instituteId, instituteId],
  )) as unknown as [[{ students: number; batches: number }]];

  const [batches] = (await db.query(
    `SELECT b.id, b.name, b.subject, b.start_time, b.end_time, b.days,
            (SELECT COUNT(*) FROM student_batches sb JOIN students s ON s.institute_id = sb.institute_id AND s.id = sb.student_id
              WHERE sb.institute_id = b.institute_id AND sb.batch_id = b.id AND s.status = 'active') AS student_count,
            a.id IS NOT NULL AS marked, a.holiday
       FROM batches b LEFT JOIN attendance_days a ON a.institute_id = b.institute_id AND a.batch_id = b.id AND a.day = ?
      WHERE b.institute_id = ? AND b.status = 'active' ORDER BY b.start_time, b.name`,
    [today, instituteId],
  )) as unknown as [
    {
      id: string;
      name: string;
      subject: string;
      start_time: string;
      end_time: string;
      days: string;
      student_count: number;
      marked: number;
      holiday: string | null;
    }[],
  ];
  const weekday = weekdayOf(today);
  const todayBatches = batches
    .filter((b) => b.days.split(',').includes(weekday) || b.marked)
    .map((b) => ({
      id: b.id,
      name: b.name,
      subject: b.subject,
      startTime: b.start_time,
      endTime: b.end_time,
      studentCount: Number(b.student_count),
      marked: !!b.marked,
      holiday: b.holiday,
    }));

  const [[collected]] = (await db.query(
    'SELECT COALESCE(SUM(amount), 0) AS net FROM payments WHERE institute_id = ? AND paid_at >= ? AND paid_at < ?',
    [instituteId, istStart(`${month}-01`), nextMonthStart(month)],
  )) as unknown as [[{ net: number }]];

  const fees = await feesOverview(db, instituteId, now);

  const from = addDays(today, -29);
  const [[att]] = (await db.query(
    `SELECT COALESCE(SUM(m.mark = 'P'), 0) AS p, COALESCE(SUM(m.mark = 'L'), 0) AS l, COALESCE(SUM(m.mark = 'A'), 0) AS a
       FROM attendance_marks m JOIN attendance_days d ON d.institute_id = m.institute_id AND d.id = m.day_id
      WHERE m.institute_id = ? AND d.day BETWEEN ? AND ? AND d.holiday IS NULL`,
    [instituteId, from, today],
  )) as unknown as [[{ p: number; l: number; a: number }]];

  return {
    today,
    activeStudents: Number(counts.students),
    activeBatches: Number(counts.batches),
    todayBatches,
    fees: {
      collectedThisMonth: Number(collected.net),
      outstanding: fees.totals.outstanding,
      overdueAmount: fees.totals.overdueAmount,
      studentsOwing: fees.totals.students,
      overdueStudents: fees.totals.overdueStudents,
    },
    attendanceLast30Days: toStat(Number(att.p), Number(att.l), Number(att.a)),
  };
}

/** Money collected in a range (net of reversals) by mode and by day, plus what was billed in the same range. */
export async function feesReport(db: Db, instituteId: string, q: { from: string; to: string }) {
  if (daysBetween(q.from, q.to) > 366) throw new AppError(400, 'range_too_long', { maxDays: 366 });
  const start = istStart(q.from);
  const end = istStart(addDays(q.to, 1));
  const [byMode] = (await db.query(
    `SELECT mode, SUM(amount) AS net, SUM(amount > 0) AS payments FROM payments
      WHERE institute_id = ? AND paid_at >= ? AND paid_at < ? GROUP BY mode ORDER BY mode`,
    [instituteId, start, end],
  )) as unknown as [{ mode: string; net: number; payments: number }[]];
  const [byDay] = (await db.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(paid_at, '+00:00', '+05:30'), '%Y-%m-%d') AS day, SUM(amount) AS net FROM payments
      WHERE institute_id = ? AND paid_at >= ? AND paid_at < ? GROUP BY day ORDER BY day`,
    [instituteId, start, end],
  )) as unknown as [{ day: string; net: number }[]];
  const [[dues]] = (await db.query(
    `SELECT COALESCE(SUM(amount), 0) AS billed, COALESCE(SUM(discount), 0) AS discount, COALESCE(SUM(paid), 0) AS collected,
            COALESCE(SUM(IF(status IN ('pending','partial'), GREATEST(CAST(amount AS SIGNED) - CAST(discount AS SIGNED) - CAST(paid AS SIGNED), 0), 0)), 0) AS outstanding
       FROM fee_dues WHERE institute_id = ? AND due_date BETWEEN ? AND ?`,
    [instituteId, q.from, q.to],
  )) as unknown as [[{ billed: number; discount: number; collected: number; outstanding: number }]];
  return {
    from: q.from,
    to: q.to,
    collected: byMode.reduce((t, r) => t + Number(r.net), 0),
    byMode: byMode.map((r) => ({ mode: r.mode, net: Number(r.net), payments: Number(r.payments) })),
    byDay: byDay.map((r) => ({ date: r.day, net: Number(r.net) })),
    dues: {
      billed: Number(dues.billed),
      discount: Number(dues.discount),
      collected: Number(dues.collected),
      outstanding: Number(dues.outstanding),
    },
  };
}
