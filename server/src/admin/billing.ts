import { z } from 'zod';
import type { Pool } from '../db.js';
import { PLANS, isPlanId } from '../billing/plans.js';

const IST = 5.5 * 3_600_000;
const DAY = 86_400_000;

export const billingQuery = z.object({
  q: z.string().trim().max(80).default(''),
  status: z.enum(['all', 'paid', 'refused']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** The first instant of the IST calendar month `back` months before `now`'s. */
function istMonthStart(now: Date, back = 0): Date {
  const ist = new Date(now.getTime() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1) - IST);
}

/**
 * The Billing page: revenue (this month, last month, all time), monthly recurring revenue from the plans running now
 * (each plan's price spread over its months), how many centres pay, are on a trial, end within 7 days or have ended,
 * and every plan payment (online through the gateway, or recorded by an admin), newest first.
 */
export async function billingOverview(pool: Pool, q: z.infer<typeof billingQuery>, now: Date) {
  const thisMonth = istMonthStart(now);
  const lastMonth = istMonthStart(now, 1);
  const [[rev]] = (await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END), 0) AS this_month,
            COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN amount ELSE 0 END), 0) AS last_month,
            COALESCE(SUM(amount), 0) AS all_time,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS count_month,
            COUNT(*) AS count_all
       FROM billing_events WHERE status = 'applied'`,
    [thisMonth, lastMonth, thisMonth, thisMonth],
  )) as unknown as [
    [
      {
        this_month: number;
        last_month: number;
        all_time: number;
        count_month: number;
        count_all: number;
      },
    ],
  ];
  const [subs] = (await pool.query(
    "SELECT plan, COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND expires_at > ? GROUP BY plan",
    [now],
  )) as unknown as [{ plan: string; n: number }[]];
  const [[ends]] = (await pool.query(
    `SELECT COALESCE(SUM(status = 'active' AND expires_at > ? AND expires_at <= ?), 0) AS soon,
            COALESCE(SUM(status = 'expired' OR expires_at <= ?), 0) AS ended
       FROM subscriptions`,
    [now, new Date(now.getTime() + 7 * DAY), now],
  )) as unknown as [[{ soon: number; ended: number }]];

  let paying = 0;
  let trials = 0;
  let mrr = 0;
  const byPlan: Record<string, number> = {};
  for (const s of subs) {
    const n = Number(s.n);
    byPlan[s.plan] = n;
    if (s.plan === 'trial') trials += n;
    else if (isPlanId(s.plan)) {
      paying += n;
      mrr += (PLANS[s.plan].pricePaise / PLANS[s.plan].months) * n;
    }
  }

  const where: string[] = [];
  const args: unknown[] = [];
  if (q.status === 'paid') where.push("e.status = 'applied'");
  if (q.status === 'refused') where.push("e.status = 'rejected'");
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push('(i.name LIKE ? OR e.payment_id LIKE ? OR e.note LIKE ?)');
    args.push(like, like, like);
  }
  const [rows] = (await pool.query(
    `SELECT e.payment_id, e.provider, e.plan_id, e.amount, e.status, e.reason, e.note, e.expires_at, e.created_at,
            e.institute_id, i.name AS centre
       FROM billing_events e LEFT JOIN institutes i ON i.id = e.institute_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.created_at DESC LIMIT ?`,
    [...args, q.limit],
  )) as unknown as [
    {
      payment_id: string;
      provider: string;
      plan_id: string | null;
      amount: number;
      status: 'applied' | 'rejected';
      reason: string | null;
      note: string | null;
      expires_at: Date | null;
      created_at: Date;
      institute_id: string | null;
      centre: string | null;
    }[],
  ];

  return {
    summary: {
      revenueThisMonth: Number(rev.this_month),
      revenueLastMonth: Number(rev.last_month),
      revenueAllTime: Number(rev.all_time),
      paymentsThisMonth: Number(rev.count_month),
      paymentsAllTime: Number(rev.count_all),
      mrr: Math.round(mrr),
      paying,
      trials,
      endingSoon: Number(ends.soon),
      ended: Number(ends.ended),
      byPlan,
    },
    payments: rows.map((r) => ({
      paymentId: r.payment_id,
      at: r.created_at.toISOString(),
      instituteId: r.institute_id,
      centre: r.centre,
      plan: r.plan_id,
      amount: Number(r.amount),
      provider: r.provider,
      // an admin-recorded payment keeps its method in `reason`; a refused one keeps why it was refused
      method: r.provider === 'manual' ? r.reason : null,
      refusedBecause: r.status === 'rejected' ? r.reason : null,
      reference: r.note,
      status: r.status === 'applied' ? ('paid' as const) : ('refused' as const),
      validUntil: r.expires_at?.toISOString() ?? null,
    })),
  };
}
