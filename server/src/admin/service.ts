import { z } from 'zod';
import { withTransaction, type Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { PLANS, computeSubscription, isPlanId, type PlanId } from '../billing/plans.js';
import { queuePlanActive } from '../messaging/centreMessages.js';
import { newId } from '../lib/ids.js';

export interface AdminActor {
  userId: string;
  phone: string;
}

const DAY = 86_400_000;

export const userListQuery = z.object({
  q: z.string().trim().max(80).default(''),
  filter: z.enum(['all', 'owners', 'staff', 'blocked', 'no-institute']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export const blockBody = z.object({ reason: z.string().trim().max(200).default('') });
export const planBody = z.object({
  plan: z.enum(['trial', 'starter', 'standard', 'pro']),
  days: z.number().int().min(1).max(3660),
});

/** Every count the dashboard's first screen needs, in one round trip. */
export async function overview(pool: Pool, now: Date) {
  const since = new Date(now.getTime() - DAY);
  const [[r]] = (await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM memberships WHERE role = 'owner') AS owners,
       (SELECT COUNT(*) FROM memberships WHERE role = 'staff') AS staff,
       (SELECT COUNT(*) FROM users WHERE blocked_at IS NOT NULL) AS blocked,
       (SELECT COUNT(*) FROM institutes) AS institutes,
       (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expires_at > ? AND plan = 'trial') AS trials,
       (SELECT COUNT(*) FROM subscriptions WHERE status = 'active' AND expires_at > ? AND plan <> 'trial') AS paid,
       (SELECT COUNT(*) FROM subscriptions WHERE status = 'expired' OR expires_at <= ?) AS expired,
       (SELECT COUNT(*) FROM students WHERE status = 'active') AS students,
       (SELECT COUNT(*) FROM users WHERE last_login_at > ?) AS logins24h,
       (SELECT COUNT(*) FROM otp_codes WHERE created_at > ?) AS codes24h,
       (SELECT COUNT(*) FROM users WHERE created_at > ?) AS signups24h,
       (SELECT COUNT(*) FROM messages WHERE status = 'sent' AND sent_at > ?) AS messagesSent24h,
       (SELECT COUNT(*) FROM messages WHERE status = 'failed' AND created_at > ?) AS messagesFailed24h,
       (SELECT COUNT(DISTINCT user_id) FROM refresh_tokens WHERE revoked_at IS NULL AND rotated_at IS NULL AND expires_at > ?) AS signedIn`,
    [now, now, now, since, since, since, since, since, now],
  )) as unknown as [[Record<string, number>]];
  return Object.fromEntries(Object.entries(r!).map(([k, v]) => [k, Number(v)]));
}

interface UserRow {
  id: string;
  phone: string;
  name: string;
  created_at: Date;
  last_login_at: Date | null;
  blocked_at: Date | null;
  blocked_reason: string;
  role: 'owner' | 'staff' | null;
  institute_id: string | null;
  institute_name: string | null;
  plan: string | null;
  plan_status: string | null;
  expires_at: Date | null;
  students: number | null;
  sessions: number;
}

const toUser = (r: UserRow, admins: string[], now: Date) => ({
  id: r.id,
  phone: r.phone,
  name: r.name,
  role: r.role,
  isAdmin: admins.includes(r.phone),
  createdAt: r.created_at.toISOString(),
  lastLoginAt: r.last_login_at?.toISOString() ?? null,
  blocked: !!r.blocked_at,
  blockedReason: r.blocked_reason,
  activeSessions: Number(r.sessions),
  institute: r.institute_id
    ? {
        id: r.institute_id,
        name: r.institute_name ?? '',
        plan: r.plan,
        active: r.plan_status === 'active' && !!r.expires_at && r.expires_at > now,
        expiresAt: r.expires_at?.toISOString() ?? null,
        students: Number(r.students ?? 0),
      }
    : null,
});

const USER_SELECT = `SELECT u.id, u.phone, u.name, u.created_at, u.last_login_at, u.blocked_at, u.blocked_reason,
    m.role, m.institute_id, i.name AS institute_name, s.plan, s.status AS plan_status, s.expires_at,
    (SELECT COUNT(*) FROM students st WHERE st.institute_id = m.institute_id AND st.status = 'active') AS students,
    (SELECT COUNT(*) FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.revoked_at IS NULL AND rt.rotated_at IS NULL AND rt.expires_at > ?) AS sessions
  FROM users u
  LEFT JOIN memberships m ON m.user_id = u.id
  LEFT JOIN institutes i ON i.id = m.institute_id
  LEFT JOIN subscriptions s ON s.institute_id = m.institute_id`;

/** Every login (tutors and helpers), newest activity first, with search by name, phone or institute. */
export async function listUsers(
  pool: Pool,
  q: z.infer<typeof userListQuery>,
  admins: string[],
  now: Date,
) {
  const where: string[] = [];
  const args: unknown[] = [now];
  if (q.q) {
    where.push('(u.name LIKE ? OR u.phone LIKE ? OR i.name LIKE ?)');
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    args.push(like, like, like);
  }
  if (q.filter === 'owners') where.push("m.role = 'owner'");
  if (q.filter === 'staff') where.push("m.role = 'staff'");
  if (q.filter === 'blocked') where.push('u.blocked_at IS NOT NULL');
  if (q.filter === 'no-institute') where.push('m.user_id IS NULL');
  const [rows] = (await pool.query(
    `${USER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY COALESCE(u.last_login_at, u.created_at) DESC, u.id LIMIT ? OFFSET ?`,
    [...args, q.limit, q.offset],
  )) as unknown as [UserRow[]];
  return rows.map((r) => toUser(r, admins, now));
}

/** One login in full: the account, its sign-ins (sessions) and its recent login-code requests. */
export async function getUser(pool: Pool, id: string, admins: string[], now: Date) {
  const [rows] = (await pool.query(`${USER_SELECT} WHERE u.id = ?`, [now, id])) as unknown as [
    UserRow[],
  ];
  if (!rows[0]) throw notFound();
  const user = toUser(rows[0], admins, now);
  const [sessions] = (await pool.query(
    `SELECT family_id, MIN(created_at) AS started, MAX(created_at) AS last_used,
            MAX(expires_at) AS expires, MAX(revoked_at) AS revoked,
            SUM(revoked_at IS NULL AND rotated_at IS NULL AND expires_at > ?) AS live
       FROM refresh_tokens WHERE user_id = ? GROUP BY family_id ORDER BY last_used DESC LIMIT 20`,
    [now, id],
  )) as unknown as [
    { started: Date; last_used: Date; expires: Date; revoked: Date | null; live: number }[],
  ];
  const [codes] = (await pool.query(
    'SELECT created_at, consumed_at, attempts, expires_at FROM otp_codes WHERE phone = ? ORDER BY created_at DESC LIMIT 20',
    [user.phone],
  )) as unknown as [
    { created_at: Date; consumed_at: Date | null; attempts: number; expires_at: Date }[],
  ];
  return {
    user,
    sessions: sessions.map((s) => ({
      startedAt: s.started.toISOString(),
      lastUsedAt: s.last_used.toISOString(),
      expiresAt: s.expires.toISOString(),
      status: Number(s.live) > 0 ? 'active' : s.revoked ? 'signed-out' : 'expired',
    })),
    codes: codes.map((c) => ({
      at: c.created_at.toISOString(),
      result: c.consumed_at
        ? 'used'
        : c.attempts > 0
          ? `wrong code x${c.attempts}`
          : c.expires_at <= now
            ? 'expired'
            : 'waiting',
    })),
  };
}

/** Recent login-code requests across all numbers (who tried to sign in, and whether it worked). */
export async function recentLogins(pool: Pool, now: Date, limit = 100) {
  const [rows] = (await pool.query(
    `SELECT o.phone, o.created_at, o.consumed_at, o.attempts, o.expires_at, u.id AS user_id, u.name
       FROM otp_codes o LEFT JOIN users u ON u.phone = o.phone
      ORDER BY o.created_at DESC LIMIT ?`,
    [limit],
  )) as unknown as [
    {
      phone: string;
      created_at: Date;
      consumed_at: Date | null;
      attempts: number;
      expires_at: Date;
      user_id: string | null;
      name: string | null;
    }[],
  ];
  return rows.map((r) => ({
    phone: r.phone,
    userId: r.user_id,
    name: r.name ?? '',
    at: r.created_at.toISOString(),
    result: r.consumed_at
      ? 'signed in'
      : r.attempts > 0
        ? `wrong code x${r.attempts}`
        : r.expires_at <= now
          ? 'code not used'
          : 'waiting',
  }));
}

async function audit(
  pool: Pool,
  a: AdminActor,
  action: string,
  t: { userId?: string; phone?: string; instituteId?: string; detail?: string },
) {
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, target_user_id, target_phone, target_institute_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      newId(),
      a.userId,
      a.phone,
      action,
      t.userId ?? null,
      t.phone ?? '',
      t.instituteId ?? null,
      (t.detail ?? '').slice(0, 300),
    ],
  );
}

async function target(pool: Pool, id: string, admins: string[], actor: AdminActor) {
  const [rows] = (await pool.query('SELECT id, phone FROM users WHERE id = ?', [
    id,
  ])) as unknown as [{ id: string; phone: string }[]];
  const u = rows[0];
  if (!u) throw notFound();
  if (u.id === actor.userId || admins.includes(u.phone))
    throw new AppError(409, 'cannot_change_admin');
  return u;
}

/** Signed out everywhere: no session works, and no phone keeps getting this person's notifications. */
const revokeAll = async (pool: Pool, userId: string, now: Date) => {
  const res = await pool.query(
    'UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
    [now, userId],
  );
  await pool.query('DELETE FROM push_tokens WHERE user_id = ?', [userId]);
  return res;
};

/** Blocks a login: it is signed out everywhere and cannot sign in again until unblocked. */
export async function blockUser(
  pool: Pool,
  actor: AdminActor,
  admins: string[],
  id: string,
  reason: string,
  now: Date,
) {
  const u = await target(pool, id, admins, actor);
  await pool.query('UPDATE users SET blocked_at = ?, blocked_reason = ? WHERE id = ?', [
    now,
    reason,
    id,
  ]);
  await revokeAll(pool, id, now);
  await audit(pool, actor, 'block', { userId: id, phone: u.phone, detail: reason });
}

export async function unblockUser(pool: Pool, actor: AdminActor, admins: string[], id: string) {
  const u = await target(pool, id, admins, actor);
  await pool.query("UPDATE users SET blocked_at = NULL, blocked_reason = '' WHERE id = ?", [id]);
  await audit(pool, actor, 'unblock', { userId: id, phone: u.phone });
}

/** Ends every sign-in of a login (all phones); they can sign in again with a new code. */
export async function signOutUser(
  pool: Pool,
  actor: AdminActor,
  admins: string[],
  id: string,
  now: Date,
) {
  const u = await target(pool, id, admins, actor);
  const [res] = (await revokeAll(pool, id, now)) as unknown as [{ affectedRows: number }];
  await audit(pool, actor, 'sign-out', { userId: id, phone: u.phone });
  return { ended: res.affectedRows };
}

/** Sets an institute's plan to run for `days` from today (or from its current end, if that is later). */
export async function setPlan(
  pool: Pool,
  actor: AdminActor,
  instituteId: string,
  b: z.infer<typeof planBody>,
  now: Date,
) {
  const [rows] = (await pool.query(
    'SELECT s.expires_at, s.status FROM subscriptions s WHERE s.institute_id = ?',
    [instituteId],
  )) as unknown as [{ expires_at: Date; status: string }[]];
  if (!rows[0]) throw notFound();
  const from = rows[0].status === 'active' && rows[0].expires_at > now ? rows[0].expires_at : now;
  const expires = new Date(from.getTime() + b.days * DAY);
  // a trial has no limits; a plan gets its own (an admin's custom limits are set with setSubscription)
  const limits = isPlanId(b.plan)
    ? { students: PLANS[b.plan].studentLimit, batches: PLANS[b.plan].batchLimit }
    : { students: null, batches: null };
  await pool.query(
    `UPDATE subscriptions SET plan = ?, status = 'active', expires_at = ?, student_limit = ?, batch_limit = ?
      WHERE institute_id = ?`,
    [b.plan, expires, limits.students, limits.batches, instituteId],
  );
  await audit(pool, actor, 'set-plan', {
    instituteId,
    detail: `${b.plan} +${b.days} days, until ${expires.toISOString().slice(0, 10)}`,
  });
  return { plan: b.plan, expiresAt: expires.toISOString() };
}

export async function auditLog(pool: Pool, limit = 100) {
  const [rows] = (await pool.query(
    'SELECT admin_phone, action, target_phone, target_institute_id, detail, created_at FROM admin_audit ORDER BY created_at DESC LIMIT ?',
    [limit],
  )) as unknown as [
    {
      admin_phone: string;
      action: string;
      target_phone: string;
      target_institute_id: string | null;
      detail: string;
      created_at: Date;
    }[],
  ];
  return rows.map((r) => ({
    at: r.created_at.toISOString(),
    admin: r.admin_phone,
    action: r.action,
    target: r.target_phone || r.target_institute_id || '',
    detail: r.detail,
  }));
}

export const subscriptionBody = z.object({
  plan: z.enum(['trial', 'starter', 'standard', 'pro']),
  status: z.enum(['active', 'expired']),
  /** The last day of the plan (IST); it ends at the end of that day. */
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studentLimit: z.number().int().min(1).max(100_000).nullable(),
  batchLimit: z.number().int().min(1).max(10_000).nullable(),
});

/** The end of an IST day as a moment: 2026-10-14 ends at 2026-10-14T18:29:59.999Z. */
const endOfIstDay = (ymd: string) => new Date(Date.parse(`${ymd}T23:59:59.999+05:30`));

/** Sets a centre's subscription exactly as the admin says: plan, status, last day and limits (null = unlimited). */
export async function setSubscription(
  pool: Pool,
  actor: AdminActor,
  instituteId: string,
  b: z.infer<typeof subscriptionBody>,
) {
  const expires = endOfIstDay(b.endsOn);
  if (Number.isNaN(expires.getTime())) throw new AppError(400, 'bad_date');
  const [r] = (await pool.query(
    `UPDATE subscriptions SET plan = ?, status = ?, expires_at = ?, student_limit = ?, batch_limit = ?
      WHERE institute_id = ?`,
    [b.plan, b.status, expires, b.studentLimit, b.batchLimit, instituteId],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
  const lim = (n: number | null) => (n === null ? 'unlimited' : String(n));
  await audit(pool, actor, 'set-subscription', {
    instituteId,
    detail: `${b.plan}, ${b.status}, until ${b.endsOn}, students ${lim(b.studentLimit)}, batches ${lim(b.batchLimit)}`,
  });
  return { ok: true, expiresAt: expires.toISOString() };
}

export const planPaymentBody = z.object({
  planId: z.enum(['starter', 'standard', 'pro']),
  amountPaise: z.number().int().min(0).max(10_000_000),
  method: z.enum(['cash', 'upi', 'bank', 'other']),
  reference: z.string().trim().max(80).default(''),
  /** Apply the plan as if bought online (renew, upgrade with credit), or only record the money. */
  apply: z.boolean(),
});

/**
 * Records a plan payment made outside the gateway (cash, bank transfer, UPI to M2W). It shows in revenue and the
 * centre's payments; with `apply`, the plan is applied by the same rules as an online purchase and the owner gets the
 * "plan active" WhatsApp.
 */
export async function recordPlanPayment(
  pool: Pool,
  actor: AdminActor,
  instituteId: string,
  b: z.infer<typeof planPaymentBody>,
  now: Date,
) {
  return withTransaction(pool, async (c) => {
    const [subs] = (await c.query(
      'SELECT plan, status, expires_at FROM subscriptions WHERE institute_id = ? FOR UPDATE',
      [instituteId],
    )) as unknown as [{ plan: string; status: string; expires_at: Date }[]];
    if (!subs[0]) throw notFound();
    const next = computeSubscription(
      { plan: subs[0].plan, status: subs[0].status, expiresAt: subs[0].expires_at },
      b.planId,
      now,
    );
    const paymentId = `manual_${newId()}`;
    await c.query(
      `INSERT INTO billing_events (payment_id, provider, institute_id, plan_id, amount, status, reason, note, expires_at)
       VALUES (?, 'manual', ?, ?, ?, 'applied', ?, ?, ?)`,
      [
        paymentId,
        instituteId,
        b.planId,
        b.amountPaise,
        b.method,
        b.reference || null,
        b.apply ? next.expiresAt : subs[0].expires_at,
      ],
    );
    if (b.apply) {
      await c.query(
        `UPDATE subscriptions SET plan = ?, status = 'active', starts_at = ?, expires_at = ?, student_limit = ?,
           batch_limit = ? WHERE institute_id = ?`,
        [next.plan, next.startsAt, next.expiresAt, next.studentLimit, next.batchLimit, instituteId],
      );
      await queuePlanActive(
        c,
        instituteId,
        { paymentId, planId: next.plan as PlanId, expiresAt: next.expiresAt },
        now,
      );
    }
    await c.query(
      'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, target_institute_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [
        newId(),
        actor.userId,
        actor.phone,
        'plan-payment',
        instituteId,
        `${b.planId} ₹${b.amountPaise / 100} by ${b.method}${b.reference ? ` (${b.reference})` : ''}${b.apply ? `, applied until ${next.expiresAt.toISOString().slice(0, 10)}` : ', not applied'}`.slice(
          0,
          250,
        ),
      ],
    );
    return {
      paymentId,
      plan: b.apply ? next.plan : subs[0].plan,
      expiresAt: (b.apply ? next.expiresAt : subs[0].expires_at).toISOString(),
    };
  });
}
