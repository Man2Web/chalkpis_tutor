import { z } from 'zod';
import type { Pool } from '../db.js';
import { isCycle, isPlanId, monthsOf, priceOf } from '../billing/plans.js';
import { RENEWS_SQL } from '../billing/webSubscriptions.js';

const IST = 5.5 * 3_600_000;
const DAY = 86_400_000;

export const billingQuery = z.object({
  q: z.string().trim().max(80).default(''),
  status: z.enum(['all', 'paid', 'refused', 'refunded', 'test']).default('all'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** The first instant of the IST calendar month `back` months before `now`'s. */
function istMonthStart(now: Date, back = 0): Date {
  const ist = new Date(now.getTime() + IST);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - back, 1) - IST);
}

/** Where a payment came from, for the revenue split. */
const SOURCE_SQL = `CASE provider WHEN 'apple' THEN 'appStore' WHEN 'google' THEN 'googlePlay'
  WHEN 'manual' THEN 'manual' ELSE 'website' END`;
/** Money that counts: paid (not refused or refunded), not a store sandbox test, in rupees. */
const REAL = "status = 'applied' AND sandbox = 0 AND currency = 'INR'";
const ymOf = (d: Date) => new Date(d.getTime() + IST).toISOString().slice(0, 7);

/**
 * The Billing page, with the numbers investors ask for:
 * - revenue (this month, last month, all time; gross, and net of store tax and commission), by source (App Store,
 *   Google Play, website, recorded by an admin) and month by month for the last 6 months;
 * - MRR from the plans running now (each plan's list price spread over its months), ARR, ARPU, how many centres pay
 *   monthly / yearly / an old pack, and through the store or not;
 * - trial to paid conversion per sign-up month, and last month's churn (centres paying when it began and not when it
 *   ended);
 * - every plan payment (gateway, store, or recorded by an admin), newest first.
 * Store sandbox purchases (App Review, testers) never count as money or as paying centres.
 */
export async function billingOverview(pool: Pool, q: z.infer<typeof billingQuery>, now: Date) {
  const thisMonth = istMonthStart(now);
  const lastMonth = istMonthStart(now, 1);
  const sixMonths = istMonthStart(now, 5);
  const [[rev]] = (await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END), 0) AS this_month,
            COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN amount ELSE 0 END), 0) AS last_month,
            COALESCE(SUM(amount), 0) AS all_time,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN COALESCE(net_amount, amount) ELSE 0 END), 0) AS net_month,
            COALESCE(SUM(COALESCE(net_amount, amount)), 0) AS net_all,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) AS count_month,
            COUNT(*) AS count_all
       FROM billing_events WHERE ${REAL}`,
    [thisMonth, lastMonth, thisMonth, thisMonth, thisMonth],
  )) as unknown as [[Record<string, number>]];
  const [bySource] = (await pool.query(
    `SELECT ${SOURCE_SQL} AS source,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN amount ELSE 0 END), 0) AS gross_month,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN COALESCE(net_amount, amount) ELSE 0 END), 0) AS net_month,
            COALESCE(SUM(amount), 0) AS gross_all, COALESCE(SUM(COALESCE(net_amount, amount)), 0) AS net_all,
            COUNT(*) AS payments
       FROM billing_events WHERE ${REAL} GROUP BY source`,
    [thisMonth, thisMonth],
  )) as unknown as [Record<string, string | number>[]];
  const [monthRows] = (await pool.query(
    `SELECT DATE_FORMAT(created_at + INTERVAL 330 MINUTE, '%Y-%m') AS ym, SUM(amount) AS gross,
            SUM(COALESCE(net_amount, amount)) AS net, COUNT(*) AS payments
       FROM billing_events WHERE ${REAL} AND created_at >= ? GROUP BY ym`,
    [sixMonths],
  )) as unknown as [{ ym: string; gross: number; net: number; payments: number }[]];
  const [subs] = (await pool.query(
    `SELECT plan, cycle, store IS NOT NULL AS in_store, COUNT(*) AS n FROM subscriptions
      WHERE status = 'active' AND expires_at > ? AND store_sandbox = 0 GROUP BY plan, cycle, in_store`,
    [now],
  )) as unknown as [{ plan: string; cycle: string | null; in_store: number; n: number }[]];
  const [[ends]] = (await pool.query(
    `SELECT COALESCE(SUM(s.status = 'active' AND s.expires_at > ? AND s.expires_at <= ? AND NOT ${RENEWS_SQL}), 0) AS soon,
            COALESCE(SUM(s.status = 'expired' OR s.expires_at <= ?), 0) AS ended,
            COALESCE(SUM(s.status = 'active' AND s.expires_at > ? AND ${RENEWS_SQL}), 0) AS renewing,
            COALESCE(SUM(s.status = 'active' AND s.expires_at > ? AND NOT (s.store IS NOT NULL AND s.store_will_renew = 1)
              AND ${RENEWS_SQL}), 0) AS renewing_web
       FROM subscriptions s`,
    [now, new Date(now.getTime() + 7 * DAY), now, now, now],
  )) as unknown as [[{ soon: number; ended: number; renewing: number; renewing_web: number }]];

  let paying = 0;
  let trials = 0;
  let mrr = 0;
  let inStore = 0;
  const byPlan: Record<string, number> = {};
  const byCycle = { month: 0, year: 0, pack: 0 };
  for (const s of subs) {
    const n = Number(s.n);
    byPlan[s.plan] = (byPlan[s.plan] ?? 0) + n;
    if (s.plan === 'trial') trials += n;
    else if (isPlanId(s.plan)) {
      const cycle = isCycle(s.cycle) ? s.cycle : null;
      paying += n;
      if (Number(s.in_store)) inStore += n;
      byCycle[cycle ?? 'pack'] += n;
      mrr += (priceOf(s.plan, cycle) / monthsOf(s.plan, cycle)) * n;
    }
  }

  // trial to paid: of the centres that signed up each month, how many have ever paid (a store test does not count)
  const [cohorts] = (await pool.query(
    `SELECT DATE_FORMAT(i.created_at + INTERVAL 330 MINUTE, '%Y-%m') AS ym, COUNT(*) AS signups,
            SUM(EXISTS (SELECT 1 FROM billing_events e WHERE e.institute_id = i.id AND e.${REAL.replace(/ AND /g, ' AND e.')})) AS paid
       FROM institutes i WHERE i.created_at >= ? GROUP BY ym ORDER BY ym`,
    [sixMonths],
  )) as unknown as [{ ym: string; signups: number; paid: number }[]];
  // churn: centres with a paid plan running when last month began that had none running when it ended
  const covered = (alias: string, at: string) =>
    `${alias}.status = 'applied' AND ${alias}.sandbox = 0 AND ${alias}.created_at <= ${at} AND ${alias}.expires_at > ${at}`;
  const [[churn]] = (await pool.query(
    `SELECT COUNT(*) AS start_n,
            COALESCE(SUM(NOT EXISTS (SELECT 1 FROM billing_events b WHERE b.institute_id = a.institute_id AND ${covered('b', '?')})), 0) AS churned
       FROM (SELECT DISTINCT institute_id FROM billing_events a WHERE a.institute_id IS NOT NULL AND ${covered('a', '?')}) a`,
    [thisMonth, thisMonth, lastMonth, lastMonth],
  )) as unknown as [[{ start_n: number; churned: number }]];

  const sources = Object.fromEntries(
    ['appStore', 'googlePlay', 'website', 'manual'].map((k) => {
      const r = bySource.find((x) => x.source === k);
      return [
        k,
        {
          grossThisMonth: Number(r?.gross_month ?? 0),
          netThisMonth: Number(r?.net_month ?? 0),
          grossAllTime: Number(r?.gross_all ?? 0),
          netAllTime: Number(r?.net_all ?? 0),
          payments: Number(r?.payments ?? 0),
        },
      ];
    }),
  );
  const months = Array.from({ length: 6 }, (_, i) => {
    const ym = ymOf(istMonthStart(now, 5 - i));
    const r = monthRows.find((x) => x.ym === ym);
    return {
      month: ym,
      gross: Number(r?.gross ?? 0),
      net: Number(r?.net ?? 0),
      payments: Number(r?.payments ?? 0),
    };
  });
  const startN = Number(churn.start_n);

  const where: string[] = [];
  const args: unknown[] = [];
  if (q.status === 'paid') where.push("e.status = 'applied' AND e.sandbox = 0");
  if (q.status === 'refused') where.push("e.status = 'rejected'");
  if (q.status === 'refunded') where.push("e.status = 'refunded'");
  if (q.status === 'test') where.push('e.sandbox = 1');
  if (q.q) {
    const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push('(i.name LIKE ? OR e.payment_id LIKE ? OR e.note LIKE ?)');
    args.push(like, like, like);
  }
  const [rows] = (await pool.query(
    `SELECT e.payment_id, e.provider, e.plan_id, e.cycle, e.amount, e.currency, e.net_amount, e.sandbox, e.status,
            e.reason, e.note, e.expires_at, e.created_at, e.institute_id, i.name AS centre
       FROM billing_events e LEFT JOIN institutes i ON i.id = e.institute_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY e.created_at DESC LIMIT ?`,
    [...args, q.limit],
  )) as unknown as [
    {
      payment_id: string;
      provider: string;
      plan_id: string | null;
      cycle: string | null;
      amount: number;
      currency: string;
      net_amount: number | null;
      sandbox: number;
      status: 'applied' | 'rejected' | 'refunded';
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
      netThisMonth: Number(rev.net_month),
      netAllTime: Number(rev.net_all),
      paymentsThisMonth: Number(rev.count_month),
      paymentsAllTime: Number(rev.count_all),
      mrr: Math.round(mrr),
      arr: Math.round(mrr * 12), // a yearly plan's ARR is its price, not 12 rounded months
      arpu: paying ? Math.round(mrr / paying) : 0,
      paying,
      inStore,
      trials,
      endingSoon: Number(ends.soon),
      autoRenewing: Number(ends.renewing),
      autoRenewingWeb: Number(ends.renewing_web),
      ended: Number(ends.ended),
      byPlan,
      byCycle,
      churnLastMonth: {
        paying: startN,
        churned: Number(churn.churned),
        rate: startN ? Number(churn.churned) / startN : null,
      },
    },
    sources,
    months,
    conversion: cohorts.map((c) => ({
      month: c.ym,
      signups: Number(c.signups),
      paid: Number(c.paid),
    })),
    payments: rows.map((r) => ({
      paymentId: r.payment_id,
      at: r.created_at.toISOString(),
      instituteId: r.institute_id,
      centre: r.centre,
      plan: r.plan_id,
      cycle: r.cycle,
      amount: Number(r.amount),
      currency: r.currency,
      net: r.net_amount === null ? null : Number(r.net_amount),
      test: !!r.sandbox,
      provider: r.provider,
      // an admin-recorded payment keeps its method in `reason`; a refused one keeps why it was refused
      method: r.provider === 'manual' ? r.reason : null,
      refusedBecause: r.status === 'rejected' ? r.reason : null,
      reference: r.note,
      status:
        r.status === 'applied'
          ? ('paid' as const)
          : r.status === 'refunded'
            ? ('refunded' as const)
            : ('refused' as const),
      validUntil: r.expires_at?.toISOString() ?? null,
    })),
  };
}
