import type { Pool } from '../db.js';
import { notFound } from '../errors.js';

const DAY = 86_400_000;
/** Calendar day in India for a UTC column. */
const IST_DAY = (col: string) => `DATE(CONVERT_TZ(${col}, '+00:00', '+05:30'))`;
const ymd = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const n = (v: unknown) => Number(v ?? 0);

type Series = Record<string, number>;

async function perDay(pool: Pool, sql: string, args: unknown[]): Promise<Series> {
  const [rows] = (await pool.query(sql, args)) as unknown as [{ d: Date | string; v: number }[]];
  const out: Series = {};
  // DATE() comes back as a Date at UTC midnight of that calendar day (the pool runs in UTC)
  for (const r of rows)
    out[typeof r.d === 'string' ? r.d.slice(0, 10) : r.d.toISOString().slice(0, 10)] = n(r.v);
  return out;
}

/**
 * Growth and usage over the last `days` days (Indian calendar days), each metric as a daily series plus totals for
 * this window and the one before it (so the dashboard can show the change).
 */
export async function analytics(pool: Pool, days: number, now: Date) {
  const from = new Date(now.getTime() - days * DAY);
  const prevFrom = new Date(now.getTime() - 2 * days * DAY);
  const metrics: Record<string, string> = {
    signups: `SELECT ${IST_DAY('created_at')} d, COUNT(*) v FROM users WHERE created_at >= ? GROUP BY d`,
    signIns: `SELECT ${IST_DAY('created_at')} d, COUNT(*) v FROM login_events WHERE created_at >= ? GROUP BY d`,
    // usage is counted on the class day and the day the money was received (what the tutor entered)
    activeInstitutes: `SELECT d, COUNT(DISTINCT institute_id) v FROM (
        SELECT day d, institute_id FROM attendance_days WHERE day >= DATE(?)
        UNION ALL SELECT ${IST_DAY('paid_at')} d, institute_id FROM payments WHERE paid_at >= ?) x GROUP BY d`,
    attendanceSaved: `SELECT day d, COUNT(*) v FROM attendance_days WHERE day >= DATE(?) GROUP BY d`,
    feesRecorded: `SELECT ${IST_DAY('paid_at')} d, COALESCE(SUM(amount), 0) v FROM payments WHERE paid_at >= ? GROUP BY d`,
    messagesSent: `SELECT ${IST_DAY('sent_at')} d, COUNT(*) v FROM messages WHERE status = 'sent' AND sent_at >= ? GROUP BY d`,
    messagesFailed: `SELECT ${IST_DAY('created_at')} d, COUNT(*) v FROM messages WHERE status = 'failed' AND created_at >= ? GROUP BY d`,
    revenue: `SELECT ${IST_DAY('created_at')} d, COALESCE(SUM(amount), 0) v FROM billing_events WHERE status = 'applied' AND created_at >= ? GROUP BY d`,
  };
  const dates = Array.from({ length: days }, (_, i) =>
    ymd(new Date(now.getTime() - (days - 1 - i) * DAY)),
  );
  const series: Record<string, number[]> = {};
  const totals: Record<string, { now: number; before: number }> = {};
  for (const [key, sql] of Object.entries(metrics)) {
    const twoArgs = key === 'activeInstitutes';
    const s = await perDay(pool, sql, twoArgs ? [prevFrom, prevFrom] : [prevFrom]);
    series[key] = dates.map((d) => s[d] ?? 0);
    const prevDates = Array.from({ length: days }, (_, i) =>
      ymd(new Date(from.getTime() - (days - 1 - i) * DAY)),
    );
    totals[key] = {
      now: series[key]!.reduce((a, b) => a + b, 0),
      before: prevDates.reduce((a, d) => a + (s[d] ?? 0), 0),
    };
  }
  // distinct active institutes over the whole window (not the sum of daily counts)
  const distinct = async (since: Date, until: Date) => {
    const [[r]] = (await pool.query(
      `SELECT COUNT(DISTINCT institute_id) v FROM (
         SELECT institute_id FROM attendance_days WHERE day >= DATE(?) AND day <= DATE(?)
         UNION ALL SELECT institute_id FROM payments WHERE paid_at >= ? AND paid_at < ?) x`,
      [since, until, since, until],
    )) as unknown as [[{ v: number }]];
    return n(r!.v);
  };
  // a payment recorded right now has paid_at = now, so the current window runs up to tomorrow
  const tomorrow = new Date(now.getTime() + DAY);
  totals.activeInstitutes = {
    now: await distinct(from, tomorrow),
    before: await distinct(prevFrom, from),
  };

  const [[f]] = (await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM institutes) AS institutes,
       (SELECT COUNT(DISTINCT institute_id) FROM students) AS withStudents,
       (SELECT COUNT(DISTINCT institute_id) FROM attendance_days) AS withAttendance,
       (SELECT COUNT(DISTINCT institute_id) FROM payments) AS withPayments,
       (SELECT COUNT(*) FROM notify_settings WHERE enabled = 1) AS messagesOn,
       (SELECT COUNT(*) FROM institutes WHERE upi_id <> '' OR payment_link <> '') AS canBePaid,
       (SELECT COUNT(*) FROM subscriptions WHERE plan <> 'trial') AS everPaid`,
  )) as unknown as [[Record<string, number>]];
  const funnel = Object.fromEntries(Object.entries(f!).map(([k, v]) => [k, n(v)]));

  const [plans] = (await pool.query(
    `SELECT plan, SUM(status = 'active' AND expires_at > ?) active, SUM(status = 'expired' OR expires_at <= ?) ended
       FROM subscriptions GROUP BY plan`,
    [now, now],
  )) as unknown as [{ plan: string; active: number; ended: number }[]];

  const [months] = (await pool.query(
    `SELECT DATE_FORMAT(CONVERT_TZ(created_at, '+00:00', '+05:30'), '%Y-%m') m, SUM(amount) v
       FROM billing_events WHERE status = 'applied' AND created_at >= ? GROUP BY m ORDER BY m`,
    [new Date(now.getTime() - 365 * DAY)],
  )) as unknown as [{ m: string; v: number }[]];

  const active7 = await distinct(new Date(now.getTime() - 7 * DAY), tomorrow);
  const active30 = await distinct(new Date(now.getTime() - 30 * DAY), tomorrow);
  return {
    days,
    dates,
    series,
    totals,
    funnel,
    retention: {
      active7,
      active30,
      rate7: funnel.institutes ? active7 / funnel.institutes : 0,
      rate30: funnel.institutes ? active30 / funnel.institutes : 0,
    },
    conversion: funnel.institutes ? (funnel.everPaid ?? 0) / funnel.institutes : 0,
    plans: plans.map((p) => ({ plan: p.plan, active: n(p.active), ended: n(p.ended) })),
    revenueByMonth: months.map((m) => ({ month: m.m, amount: n(m.v) })),
  };
}

interface InstRow {
  id: string;
  name: string;
  created_at: Date;
  owner_name: string | null;
  owner_phone: string | null;
  owner_id: string | null;
  plan: string | null;
  plan_status: string | null;
  expires_at: Date | null;
  students: number;
  batches: number;
  staff: number;
  last_attendance: Date | null;
  last_payment: Date | null;
  last_login: Date | null;
  messages30: number;
  failed30: number;
  collected30: number;
  messages_on: number | null;
  upi_id: string;
  payment_link: string;
}

/**
 * 0-100: how healthy a centre looks. Recent use counts most, then having students, a way for parents to pay, and
 * parent messages switched on. A rough guide for who needs a call, not a business metric.
 */
export function healthScore(i: {
  lastActivity: Date | null;
  students: number;
  canBePaid: boolean;
  messagesOn: boolean;
  now: Date;
}): number {
  let s = 0;
  if (i.lastActivity) {
    const age = (i.now.getTime() - i.lastActivity.getTime()) / DAY;
    s += age <= 3 ? 45 : age <= 7 ? 35 : age <= 30 ? 15 : 0;
  }
  s += i.students >= 10 ? 25 : i.students > 0 ? 15 : 0;
  if (i.canBePaid) s += 15;
  if (i.messagesOn) s += 15;
  return Math.min(100, s);
}

const INST_SELECT = `SELECT i.id, i.name, i.created_at, i.upi_id, i.payment_link,
    u.name AS owner_name, u.phone AS owner_phone, u.id AS owner_id,
    s.plan, s.status AS plan_status, s.expires_at, ns.enabled AS messages_on,
    (SELECT COUNT(*) FROM students st WHERE st.institute_id = i.id AND st.status = 'active') AS students,
    (SELECT COUNT(*) FROM batches b WHERE b.institute_id = i.id AND b.status = 'active') AS batches,
    (SELECT COUNT(*) FROM memberships m WHERE m.institute_id = i.id AND m.role = 'staff') AS staff,
    (SELECT MAX(created_at) FROM attendance_days a WHERE a.institute_id = i.id) AS last_attendance,
    (SELECT MAX(paid_at) FROM payments p WHERE p.institute_id = i.id) AS last_payment,
    (SELECT MAX(uu.last_login_at) FROM memberships mm JOIN users uu ON uu.id = mm.user_id WHERE mm.institute_id = i.id) AS last_login,
    (SELECT COUNT(*) FROM messages ms WHERE ms.institute_id = i.id AND ms.status = 'sent' AND ms.sent_at >= ?) AS messages30,
    (SELECT COUNT(*) FROM messages ms WHERE ms.institute_id = i.id AND ms.status = 'failed' AND ms.created_at >= ?) AS failed30,
    (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.institute_id = i.id AND p.paid_at >= ?) AS collected30
  FROM institutes i
  LEFT JOIN users u ON u.id = i.owner_user_id
  LEFT JOIN subscriptions s ON s.institute_id = i.id
  LEFT JOIN notify_settings ns ON ns.institute_id = i.id`;

const latest = (...d: (Date | null)[]) =>
  d.filter((x): x is Date => !!x).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

function toInstitute(r: InstRow, now: Date) {
  const lastActivity = latest(r.last_attendance, r.last_payment, r.last_login);
  const canBePaid = !!(r.upi_id || r.payment_link);
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at.toISOString(),
    owner: r.owner_id
      ? { id: r.owner_id, name: r.owner_name ?? '', phone: r.owner_phone ?? '' }
      : null,
    plan: r.plan,
    planActive: r.plan_status === 'active' && !!r.expires_at && r.expires_at > now,
    expiresAt: r.expires_at?.toISOString() ?? null,
    students: n(r.students),
    batches: n(r.batches),
    staff: n(r.staff),
    lastActivityAt: lastActivity?.toISOString() ?? null,
    messages30: n(r.messages30),
    failed30: n(r.failed30),
    collected30: n(r.collected30),
    canBePaid,
    messagesOn: !!r.messages_on,
    health: healthScore({
      lastActivity,
      students: n(r.students),
      canBePaid,
      messagesOn: !!r.messages_on,
      now,
    }),
  };
}

export type InstituteSort = 'activity' | 'students' | 'health' | 'newest' | 'expiring';

/** Every centre, with the numbers an owner of Chalkpis wants to see at a glance. */
export async function listInstitutes(
  pool: Pool,
  q: { q: string; sort: InstituteSort; filter: 'all' | 'trial' | 'paid' | 'ended' | 'at-risk' },
  now: Date,
) {
  const since = new Date(now.getTime() - 30 * DAY);
  const where: string[] = [];
  const args: unknown[] = [since, since, since];
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push('(i.name LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)');
    args.push(like, like, like);
  }
  const cond = {
    trial: "s.plan = 'trial' AND s.expires_at > ?",
    paid: "s.plan <> 'trial' AND s.expires_at > ?",
    ended: "(s.status = 'expired' OR s.expires_at <= ?)",
  } as const;
  if (q.filter === 'trial' || q.filter === 'paid' || q.filter === 'ended') {
    where.push(cond[q.filter]);
    args.push(now);
  }
  const [rows] = (await pool.query(
    `${INST_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} LIMIT 1000`,
    args,
  )) as unknown as [InstRow[]];
  let list = rows.map((r) => toInstitute(r, now));
  if (q.filter === 'at-risk') list = list.filter((i) => i.health < 40);
  const t = (s: string | null) => (s ? Date.parse(s) : 0);
  const sorters: Record<InstituteSort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
    activity: (a, b) => t(b.lastActivityAt) - t(a.lastActivityAt),
    students: (a, b) => b.students - a.students,
    health: (a, b) => a.health - b.health,
    newest: (a, b) => t(b.createdAt) - t(a.createdAt),
    expiring: (a, b) => t(a.expiresAt) - t(b.expiresAt),
  };
  return list.sort(sorters[q.sort]);
}

/** One centre in depth: the numbers, its people, its message mix and plan payments. */
export async function getInstitute(pool: Pool, id: string, now: Date) {
  const since = new Date(now.getTime() - 30 * DAY);
  const [rows] = (await pool.query(`${INST_SELECT} WHERE i.id = ?`, [
    since,
    since,
    since,
    id,
  ])) as unknown as [InstRow[]];
  if (!rows[0]) throw notFound();
  const [people] = (await pool.query(
    `SELECT u.id, u.name, u.phone, m.role, u.last_login_at, u.blocked_at FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.institute_id = ? ORDER BY m.role, u.name`,
    [id],
  )) as unknown as [
    {
      id: string;
      name: string;
      phone: string;
      role: string;
      last_login_at: Date | null;
      blocked_at: Date | null;
    }[],
  ];
  const [mix] = (await pool.query(
    'SELECT type, status, COUNT(*) c FROM messages WHERE institute_id = ? AND created_at >= ? GROUP BY type, status',
    [id, since],
  )) as unknown as [{ type: string; status: string; c: number }[]];
  const [billing] = (await pool.query(
    "SELECT plan_id, amount, created_at FROM billing_events WHERE institute_id = ? AND status = 'applied' ORDER BY created_at DESC LIMIT 20",
    [id],
  )) as unknown as [{ plan_id: string | null; amount: number; created_at: Date }[]];
  const [[counts]] = (await pool.query(
    `SELECT (SELECT COUNT(*) FROM attendance_days WHERE institute_id = ? AND day >= DATE(?)) AS attendance30,
            (SELECT COUNT(*) FROM payments WHERE institute_id = ? AND amount > 0 AND paid_at >= ?) AS payments30,
            (SELECT COALESCE(SUM(GREATEST(CAST(amount AS SIGNED) - CAST(discount AS SIGNED) - CAST(paid AS SIGNED), 0)), 0)
               FROM fee_dues WHERE institute_id = ? AND status IN ('pending','partial')) AS outstanding`,
    [id, since, id, since, id],
  )) as unknown as [[{ attendance30: number; payments30: number; outstanding: number }]];
  return {
    institute: toInstitute(rows[0], now),
    activity: {
      attendance30: n(counts!.attendance30),
      payments30: n(counts!.payments30),
      outstanding: n(counts!.outstanding),
    },
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      role: p.role,
      lastLoginAt: p.last_login_at?.toISOString() ?? null,
      blocked: !!p.blocked_at,
    })),
    messages: mix.map((m) => ({ type: m.type, status: m.status, count: n(m.c) })),
    billing: billing.map((b) => ({
      plan: b.plan_id,
      amount: n(b.amount),
      at: b.created_at.toISOString(),
    })),
  };
}
