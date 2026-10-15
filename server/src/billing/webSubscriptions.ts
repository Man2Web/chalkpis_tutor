import { withTransaction, type Pool, type PoolConnection } from '../db.js';
import { AppError } from '../errors.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { queuePlanActive } from '../messaging/centreMessages.js';
import { PLANS, PLAN_RANK, priceOf, type Cycle, type PlanId } from './plans.js';
import type { BillingProvider, GatewaySubscription, SubscriptionEvent } from './provider.js';
import { applyPurchase, storeRenews, SUB_COLUMNS, type SubRow } from './service.js';

/**
 * Website plans that renew by themselves (Razorpay Subscriptions: UPI Autopay or a card mandate), decision 146.
 * - The owner approves a mandate on Razorpay's page. The first charge is taken when the trial or the running plan ends
 *   (nobody pays twice for the same days); an upgrade is charged at once and the old subscription is cancelled, its
 *   unused days credited by the usual rules.
 * - Every charge extends the plan by one cycle (applyPurchase), once per payment id, at the price of OUR row.
 * - It renews while authenticated, active or pending (a failed charge Razorpay is retrying), unless set to stop at the
 *   end of its cycle. Halted, cancelled, completed or expired: the plan simply runs to its paid end.
 */

export const RENEWING = ['authenticated', 'active', 'pending'] as const;
type Db = Pool | PoolConnection;

export interface WebSubRow {
  id: string;
  institute_id: string;
  plan_id: PlanId;
  cycle: Cycle;
  amount: number | string;
  status: string;
  cancel_at_cycle_end: number;
  start_at: Date | null;
  current_end: Date | null;
  charge_at: Date | null;
  short_url: string;
  created_at: Date;
}
const WEB_COLUMNS =
  'id, institute_id, plan_id, cycle, amount, status, cancel_at_cycle_end, start_at, current_end, charge_at, short_url, created_at';

/** The centre's website subscription that renews by itself now, if any. */
export async function renewingWebSub(db: Db, instituteId: string): Promise<WebSubRow | null> {
  const [rows] = (await db.query(
    `SELECT ${WEB_COLUMNS} FROM web_subscriptions
      WHERE institute_id = ? AND status IN ('authenticated','active','pending') AND cancel_at_cycle_end = 0
      ORDER BY created_at DESC LIMIT 1`,
    [instituteId],
  )) as unknown as [WebSubRow[]];
  return rows[0] ?? null;
}

/** SQL (for a `subscriptions s` row) that is true while the plan renews by itself, through the store or the website. */
export const RENEWS_SQL = `((s.store IS NOT NULL AND s.store_will_renew = 1) OR EXISTS (
  SELECT 1 FROM web_subscriptions w WHERE w.institute_id = s.institute_id
    AND w.status IN ('authenticated','active','pending') AND w.cancel_at_cycle_end = 0))`;

/** How the plan renews by itself, for the app, the pay pages and admin; null when it does not. */
export async function autoRenewFor(db: Db, instituteId: string) {
  const [subs] = (await db.query(
    `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE institute_id = ?`,
    [instituteId],
  )) as unknown as [SubRow[]];
  const row = subs[0];
  if (row && storeRenews(row))
    return {
      via: row.store as 'app_store' | 'play_store',
      status: 'active',
      nextChargeAt: row.expires_at.toISOString(),
      plan: row.plan,
      cycle: row.cycle,
      amountPaise: null as number | null,
    };
  const w = await renewingWebSub(db, instituteId);
  if (!w) return null;
  return {
    via: 'website' as const,
    status: w.status,
    nextChargeAt: (w.charge_at ?? w.start_at ?? w.current_end)?.toISOString() ?? null,
    plan: w.plan_id,
    cycle: w.cycle,
    amountPaise: Number(w.amount),
  };
}

/** The Razorpay plan for a price, made through the API the first time and kept. */
async function gatewayPlan(pool: Pool, provider: BillingProvider, plan: PlanId, cycle: Cycle) {
  const amount = priceOf(plan, cycle);
  const [rows] = (await pool.query(
    'SELECT rp_plan_id FROM razorpay_plans WHERE plan_id = ? AND cycle = ? AND amount = ?',
    [plan, cycle, amount],
  )) as unknown as [{ rp_plan_id: string }[]];
  if (rows[0]) return rows[0].rp_plan_id;
  const id = await provider.createPlan!({
    period: cycle === 'year' ? 'yearly' : 'monthly',
    amountPaise: amount,
    name: `Chalkpis ${PLANS[plan].name} (${cycle === 'year' ? 'yearly' : 'monthly'})`,
  });
  await pool.query(
    'INSERT IGNORE INTO razorpay_plans (plan_id, cycle, amount, rp_plan_id) VALUES (?, ?, ?, ?)',
    [plan, cycle, amount, id],
  );
  const [again] = (await pool.query(
    'SELECT rp_plan_id FROM razorpay_plans WHERE plan_id = ? AND cycle = ? AND amount = ?',
    [plan, cycle, amount],
  )) as unknown as [{ rp_plan_id: string }[]];
  return again[0]!.rp_plan_id;
}

const toDate = (sec: number | null) => (sec ? new Date(sec * 1000) : null);

/**
 * Starts auto-renew for a plan: creates the Razorpay subscription and returns the page where the owner approves it.
 * - While an in-app store subscription renews, or the same plan already renews here: refused.
 * - A lower plan than the one renewing waits for its renewal: turn auto-renew off, then choose it.
 * - A higher plan starts now (the old subscription is cancelled once this one is approved); otherwise the first charge
 *   is when the trial or the running plan ends.
 * Asking again within 30 minutes for the same plan, before approving, gives the same page.
 */
export async function startWebSubscription(
  pool: Pool,
  provider: BillingProvider,
  a: { instituteId: string; userId: string; planId: PlanId; cycle: Cycle; now: Date },
): Promise<{ id: string; url: string; startAt: Date | null; amountPaise: number }> {
  if (!provider.createSubscription || !provider.createPlan)
    throw new AppError(503, 'billing_unavailable');
  const amount = priceOf(a.planId, a.cycle);
  const rpPlanId = await gatewayPlan(pool, provider, a.planId, a.cycle);
  return withNamedLock(pool, `billing:${a.instituteId}`, async (conn) => {
    const [subs] = (await conn.query(
      `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE institute_id = ?`,
      [a.instituteId],
    )) as unknown as [SubRow[]];
    const row = subs[0];
    if (storeRenews(row))
      throw new AppError(409, 'store_managed', {
        store: row!.store,
        until: row!.expires_at.toISOString(),
      });
    const renewing = await renewingWebSub(conn, a.instituteId);
    if (renewing && renewing.plan_id === a.planId && renewing.cycle === a.cycle)
      throw new AppError(409, 'already_renewing');
    if (renewing && PLAN_RANK[a.planId] < PLAN_RANK[renewing.plan_id])
      throw new AppError(409, 'downgrade_at_renewal', {
        until: (renewing.current_end ?? row?.expires_at ?? a.now).toISOString(),
      });
    const [recent] = (await conn.query(
      `SELECT ${WEB_COLUMNS} FROM web_subscriptions
        WHERE institute_id = ? AND plan_id = ? AND cycle = ? AND status = 'created'
          AND created_at > ? ORDER BY created_at DESC LIMIT 1`,
      [a.instituteId, a.planId, a.cycle, new Date(a.now.getTime() - 30 * 60_000)],
    )) as unknown as [WebSubRow[]];
    if (recent[0])
      return {
        id: recent[0].id,
        url: recent[0].short_url,
        startAt: recent[0].start_at,
        amountPaise: amount,
      };
    // the first charge: now for an upgrade (or when nothing runs), else when the trial or plan ends
    const running =
      row?.status === 'active' && row.expires_at.getTime() > a.now.getTime() + 5 * 60_000;
    const upgrade =
      running &&
      row.plan !== 'trial' &&
      row.plan in PLAN_RANK &&
      PLAN_RANK[a.planId] > PLAN_RANK[row.plan as PlanId];
    const startAt = running && !upgrade ? row.expires_at : null;
    let sub: GatewaySubscription;
    try {
      sub = await provider.createSubscription!({
        rpPlanId,
        totalCount: a.cycle === 'year' ? 10 : 120,
        ...(startAt ? { startAt: Math.floor(startAt.getTime() / 1000) } : {}),
        notes: { institute_id: a.instituteId, plan: a.planId, cycle: a.cycle },
      });
    } catch (e) {
      throw Object.assign(new AppError(502, 'payment_provider_error'), { cause: e });
    }
    await conn.query(
      `INSERT INTO web_subscriptions (id, institute_id, plan_id, cycle, amount, rp_plan_id, status, start_at, short_url, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
      [
        sub.id,
        a.instituteId,
        a.planId,
        a.cycle,
        amount,
        rpPlanId,
        startAt,
        sub.shortUrl,
        a.userId,
        a.now,
      ],
    );
    return { id: sub.id, url: sub.shortUrl, startAt, amountPaise: amount };
  });
}

/**
 * A charge Razorpay took for a subscription (`subscription.charged`, or found by the reconcile job): extends the plan by
 * one cycle, once per payment id. The centre, plan and price come from our row, never from the webhook's notes.
 */
export async function applyWebCharge(
  pool: Pool,
  p: { subscriptionId: string; paymentId: string; amountPaise: number },
  now: Date,
): Promise<'applied' | 'duplicate' | 'invalid'> {
  try {
    return await withTransaction(pool, async (c) => {
      const [rows] = (await c.query(`SELECT ${WEB_COLUMNS} FROM web_subscriptions WHERE id = ?`, [
        p.subscriptionId,
      ])) as unknown as [WebSubRow[]];
      const w = rows[0];
      const reject = async (reason: string) => {
        await c.query(
          "INSERT INTO billing_events (payment_id, provider, subscription_id, institute_id, plan_id, cycle, amount, status, reason) VALUES (?, 'razorpay', ?, ?, ?, ?, ?, 'rejected', ?)",
          [
            p.paymentId,
            w ? w.id : null,
            w?.institute_id ?? null,
            w?.plan_id ?? null,
            w?.cycle ?? null,
            p.amountPaise,
            reason,
          ],
        );
        return 'invalid' as const;
      };
      if (!w) return reject('unknown_subscription');
      if (Number(w.amount) !== p.amountPaise || priceOf(w.plan_id, w.cycle) !== p.amountPaise)
        return reject('amount_mismatch');
      const [subs] = (await c.query(
        `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE institute_id = ? FOR UPDATE`,
        [w.institute_id],
      )) as unknown as [SubRow[]];
      const next = await applyPurchase(c, w.institute_id, subs[0], w.plan_id, w.cycle, now);
      await c.query(
        `INSERT INTO billing_events (payment_id, provider, subscription_id, institute_id, plan_id, cycle, amount, net_amount, status, note, expires_at)
         VALUES (?, 'razorpay', ?, ?, ?, ?, ?, ?, 'applied', 'Auto-renew', ?)`,
        [
          p.paymentId,
          w.id,
          w.institute_id,
          w.plan_id,
          w.cycle,
          p.amountPaise,
          p.amountPaise,
          next.expiresAt,
        ],
      );
      await queuePlanActive(
        c,
        w.institute_id,
        { paymentId: p.paymentId, planId: next.plan, expiresAt: next.expiresAt },
        now,
      );
      return 'applied' as const;
    });
  } catch (e) {
    if ((e as { code?: string }).code !== 'ER_DUP_ENTRY') throw e;
    const [ev] = (await pool.query('SELECT status FROM billing_events WHERE payment_id = ?', [
      p.paymentId,
    ])) as unknown as [{ status: string }[]];
    return ev[0]?.status === 'rejected' ? 'invalid' : 'duplicate';
  }
}

/**
 * Keeps our row in step with Razorpay. When a subscription is approved (authenticated or active), the centre's other
 * renewing website subscription is stopped: at once if this one is a higher plan (its unused days are credited when
 * this one charges), else at the end of its paid cycle.
 */
export async function updateWebStatus(
  pool: Pool,
  provider: BillingProvider | null,
  sub: GatewaySubscription,
): Promise<boolean> {
  const [res] = (await pool.query(
    'UPDATE web_subscriptions SET status = ?, current_end = COALESCE(?, current_end), charge_at = ? WHERE id = ?',
    [sub.status, toDate(sub.currentEnd), toDate(sub.chargeAt), sub.id],
  )) as unknown as [{ affectedRows: number }];
  if (!res.affectedRows) return false;
  if (sub.status !== 'authenticated' && sub.status !== 'active') return true;
  const [mine] = (await pool.query(
    'SELECT institute_id, plan_id FROM web_subscriptions WHERE id = ?',
    [sub.id],
  )) as unknown as [{ institute_id: string; plan_id: PlanId }[]];
  const [others] = (await pool.query(
    `SELECT id, plan_id, status FROM web_subscriptions
      WHERE institute_id = ? AND id <> ? AND status IN ('authenticated','active','pending') AND cancel_at_cycle_end = 0`,
    [mine[0]!.institute_id, sub.id],
  )) as unknown as [{ id: string; plan_id: PlanId; status: string }[]];
  for (const o of others) {
    // nothing charged yet, or replaced by a higher plan: stop it now; else let its paid cycle run out
    const now = o.status === 'authenticated' || PLAN_RANK[mine[0]!.plan_id] > PLAN_RANK[o.plan_id];
    try {
      await provider?.cancelSubscription?.(o.id, !now);
    } catch {
      // Razorpay unreachable: our row still stops counting it as renewing; the reconcile job looks again
    }
    await pool.query('UPDATE web_subscriptions SET cancel_at_cycle_end = 1 WHERE id = ?', [o.id]);
  }
  return true;
}

/** One `subscription.*` webhook: status first, then the charge it carries. */
export async function handleSubscriptionEvent(
  pool: Pool,
  provider: BillingProvider | null,
  e: SubscriptionEvent,
  now: Date,
): Promise<string> {
  const known = await updateWebStatus(pool, provider, e.subscription);
  if (!known) return 'ignored';
  if (e.event === 'subscription.charged' && e.payment && e.payment.status === 'captured')
    return applyWebCharge(
      pool,
      {
        subscriptionId: e.subscription.id,
        paymentId: e.payment.id,
        amountPaise: e.payment.amountPaise,
      },
      now,
    );
  return 'updated';
}

/**
 * Turns auto-renew off for a centre: the subscription stops at the end of its paid cycle (at once if nothing was
 * charged yet). The plan runs to its paid end. Returns false when nothing renews.
 */
export async function stopAutoRenew(
  pool: Pool,
  provider: BillingProvider,
  instituteId: string,
  actor: { userId: string; phone: string } | null,
): Promise<boolean> {
  const w = await renewingWebSub(pool, instituteId);
  if (!w) return false;
  const atCycleEnd = w.status !== 'authenticated';
  try {
    await provider.cancelSubscription?.(w.id, atCycleEnd);
  } catch (e) {
    throw Object.assign(new AppError(502, 'payment_provider_error'), { cause: e });
  }
  await pool.query(
    `UPDATE web_subscriptions SET cancel_at_cycle_end = 1${atCycleEnd ? '' : ", status = 'cancelled'"} WHERE id = ?`,
    [w.id],
  );
  if (actor)
    await pool.query(
      'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, target_institute_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [newId(), actor.userId, actor.phone, 'stop-autorenew', instituteId, w.id],
    );
  return true;
}

/**
 * Safety net for missed webhooks (hourly): subscriptions whose charge date has passed are read again from Razorpay,
 * their status updated and any paid invoice we have not applied yet applied. Never throws; returns charges applied.
 */
export async function reconcileWebSubscriptions(
  pool: Pool,
  provider: BillingProvider | null,
  now: Date,
): Promise<number> {
  if (!provider?.getSubscription || !provider.subscriptionInvoices) return 0;
  let applied = 0;
  try {
    const [rows] = (await pool.query(
      `SELECT ${WEB_COLUMNS} FROM web_subscriptions
        WHERE status IN ('created','authenticated','active','pending')
          AND (charge_at IS NULL OR charge_at <= ?)
        ORDER BY created_at LIMIT 50`,
      [now],
    )) as unknown as [WebSubRow[]];
    for (const w of rows) {
      try {
        // an approval page nobody used for two days is left alone (it never renews)
        if (w.status === 'created' && now.getTime() - w.created_at.getTime() > 2 * 86_400_000) {
          await pool.query("UPDATE web_subscriptions SET status = 'expired' WHERE id = ?", [w.id]);
          continue;
        }
        await updateWebStatus(pool, provider, await provider.getSubscription(w.id));
        for (const inv of await provider.subscriptionInvoices(w.id))
          if (inv.status === 'paid' && inv.paymentId)
            if (
              (await applyWebCharge(
                pool,
                { subscriptionId: w.id, paymentId: inv.paymentId, amountPaise: inv.amountPaise },
                now,
              )) === 'applied'
            )
              applied++;
      } catch {
        // this one is tried again next hour
      }
    }
  } catch {
    return applied;
  }
  return applied;
}
