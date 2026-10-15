import { AppError } from '../errors.js';
import { withTransaction, type Pool, type PoolConnection } from '../db.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { queuePlanActive } from '../messaging/centreMessages.js';
import {
  PLANS,
  computeSubscription,
  isPlanId,
  planChange,
  priceOf,
  type Cycle,
  type PlanId,
} from './plans.js';
import type { BillingProvider, PaidEvent, ProviderName } from './provider.js';

export type PurchaseResult = 'applied' | 'duplicate' | 'invalid';

/** A centre's subscription row, as the purchase rules need it. */
export interface SubRow {
  plan: string;
  cycle: Cycle | null;
  status: string;
  expires_at: Date;
  store: 'app_store' | 'play_store' | null;
  store_will_renew: number | null;
  banked_plan: string | null;
  banked_cycle: Cycle | null;
  banked_ms: number | string | null;
}
export const SUB_COLUMNS =
  'plan, cycle, status, expires_at, store, store_will_renew, banked_plan, banked_cycle, banked_ms';

/** The store subscription renews by itself: the website and pay links sell nothing meanwhile. */
export const storeRenews = (row: Pick<SubRow, 'store' | 'store_will_renew'> | undefined) =>
  !!row?.store && !!row.store_will_renew;

/**
 * Applies one paid cycle of a plan to a centre (inside a transaction, the row locked FOR UPDATE). Normally the plan
 * changes by the purchase rules (renew, upgrade with credit, start after the trial). While an App Store / Google Play
 * subscription decides the plan, the purchase is banked instead: it is added to the days that resume when the store
 * subscription ends. Returns the plan and the date to show as "valid until".
 */
export async function applyPurchase(
  c: PoolConnection,
  instituteId: string,
  row: SubRow | undefined,
  planId: PlanId,
  cycle: Cycle | null,
  now: Date,
): Promise<{ plan: PlanId; expiresAt: Date }> {
  if (row?.store) {
    const banked = Number(row.banked_ms ?? 0);
    const next = computeSubscription(
      banked > 0 && row.banked_plan
        ? {
            plan: row.banked_plan,
            cycle: row.banked_cycle,
            status: 'active',
            expiresAt: new Date(now.getTime() + banked),
          }
        : undefined,
      planId,
      cycle,
      now,
    );
    const ms = next.expiresAt.getTime() - now.getTime();
    await c.query(
      'UPDATE subscriptions SET banked_plan = ?, banked_cycle = ?, banked_ms = ? WHERE institute_id = ?',
      [next.plan, next.cycle, ms, instituteId],
    );
    return { plan: next.plan, expiresAt: new Date(row.expires_at.getTime() + ms) };
  }
  const next = computeSubscription(
    row
      ? { plan: row.plan, cycle: row.cycle, status: row.status, expiresAt: row.expires_at }
      : undefined,
    planId,
    cycle,
    now,
  );
  await c.query(
    `INSERT INTO subscriptions (institute_id, plan, cycle, status, starts_at, expires_at, student_limit, batch_limit)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE plan = VALUES(plan), cycle = VALUES(cycle), status = 'active', starts_at = VALUES(starts_at),
       expires_at = VALUES(expires_at), student_limit = VALUES(student_limit), batch_limit = VALUES(batch_limit)`,
    [
      instituteId,
      next.plan,
      next.cycle,
      next.startsAt,
      next.expiresAt,
      next.studentLimit,
      next.batchLimit,
    ],
  );
  return { plan: next.plan, expiresAt: next.expiresAt };
}

/**
 * Asks the provider for a payment link and remembers it as our own order. Works even when the plan has expired.
 * Asking again for the same plan within 15 minutes, while that order is still unpaid, gives the same order and
 * link (a double tap or a retry must never leave two payable orders); one centre's requests run one at a time.
 */
export async function createOrder(
  pool: Pool,
  provider: BillingProvider,
  a: {
    instituteId: string;
    userId: string;
    planId: PlanId;
    cycle: Cycle;
    ownerPhone?: string;
    /** The page the payer returns to, given our order id. */
    returnUrl?: (orderId: string) => string;
    now?: Date;
  },
) {
  return withNamedLock(pool, `billing:${a.instituteId}`, async (conn) => {
    const plan = PLANS[a.planId];
    const amount = priceOf(a.planId, a.cycle);
    const [cur] = (await conn.query(
      `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE institute_id = ?`,
      [a.instituteId],
    )) as unknown as [SubRow[]];
    // paying twice for the same months: the store subscription already renews by itself
    if (storeRenews(cur[0]))
      throw new AppError(409, 'store_managed', {
        store: cur[0]!.store,
        until: cur[0]!.expires_at.toISOString(),
      });
    // nor while auto-renew on the website is on (it charges the next cycle itself)
    const [auto] = (await conn.query(
      `SELECT id FROM web_subscriptions WHERE institute_id = ? AND cancel_at_cycle_end = 0
          AND status IN ('authenticated','active','pending') LIMIT 1`,
      [a.instituteId],
    )) as unknown as [{ id: string }[]];
    if (auto[0]) throw new AppError(409, 'auto_renew_on');
    const change = planChange(
      cur[0]
        ? { plan: cur[0].plan, status: cur[0].status, expiresAt: cur[0].expires_at }
        : undefined,
      a.planId,
      a.now ?? new Date(),
    );
    if (!change.ok)
      throw new AppError(409, 'plan_downgrade', { until: change.until.toISOString() });
    const [recent] = (await conn.query(
      `SELECT o.id, o.url FROM billing_orders o
      WHERE o.institute_id = ? AND o.plan_id = ? AND o.cycle = ? AND o.provider = ?
        AND o.created_at > NOW(3) - INTERVAL 15 MINUTE
        AND NOT EXISTS (SELECT 1 FROM billing_events e WHERE e.order_id = o.id)
      ORDER BY o.created_at DESC LIMIT 1`,
      [a.instituteId, a.planId, a.cycle, provider.name],
    )) as unknown as [{ id: string; url: string }[]];
    if (recent[0])
      return {
        orderId: recent[0].id,
        url: recent[0].url,
        planId: a.planId,
        cycle: a.cycle,
        amountPaise: amount,
      };
    const orderId = newId();
    let link;
    try {
      link = await provider.createPaymentLink({
        amountPaise: amount,
        description: `Chalkpis ${plan.name} plan (${a.cycle === 'year' ? '1 year' : '1 month'})`,
        referenceId: orderId,
        customerPhone: a.ownerPhone,
        returnUrl: a.returnUrl?.(orderId),
      });
    } catch (e) {
      // the provider's own reason stays on the error (for the server log), never in the answer to the client
      throw Object.assign(new AppError(502, 'payment_provider_error'), { cause: e });
    }
    await conn.query(
      'INSERT INTO billing_orders (id, institute_id, plan_id, cycle, amount, provider, link_id, url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        orderId,
        a.instituteId,
        a.planId,
        a.cycle,
        amount,
        provider.name,
        link.id,
        link.url,
        a.userId,
      ],
    );
    return { orderId, url: link.url, planId: a.planId, cycle: a.cycle, amountPaise: amount };
  });
}

/**
 * Applies a paid plan exactly once. The order comes from OUR table (looked up by the provider's link id), so the
 * plan, the institute and the price cannot be forged by whoever sends the webhook. A repeated delivery is
 * 'duplicate' (the payment id is the primary key); an unknown link or a wrong amount is recorded and refused.
 */
export async function applyPaid(
  pool: Pool,
  provider: ProviderName,
  p: PaidEvent,
  now: Date,
): Promise<PurchaseResult> {
  try {
    return await withTransaction(pool, async (c) => {
      const [orders] = (await c.query(
        'SELECT id, institute_id, plan_id, cycle, amount FROM billing_orders WHERE provider = ? AND link_id = ?',
        [provider, p.linkId],
      )) as unknown as [
        {
          id: string;
          institute_id: string;
          plan_id: PlanId;
          cycle: Cycle | null;
          amount: number;
        }[],
      ];
      const order = orders[0];
      const reject = async (reason: string) => {
        await c.query(
          "INSERT INTO billing_events (payment_id, provider, order_id, institute_id, plan_id, cycle, amount, status, reason) VALUES (?, ?, ?, ?, ?, ?, ?, 'rejected', ?)",
          [
            p.paymentId,
            provider,
            order?.id ?? null,
            order?.institute_id ?? null,
            order?.plan_id ?? null,
            order?.cycle ?? null,
            p.amountPaise,
            reason,
          ],
        );
        return 'invalid' as const;
      };
      if (!order) return reject('unknown_link');
      // the price the order was made at: a pack ordered before monthly and yearly plans keeps its old price
      if (
        Number(order.amount) !== p.amountPaise ||
        priceOf(order.plan_id, order.cycle) !== p.amountPaise
      )
        return reject('amount_mismatch');

      const [subs] = (await c.query(
        `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE institute_id = ? FOR UPDATE`,
        [order.institute_id],
      )) as unknown as [SubRow[]];
      const next = await applyPurchase(
        c,
        order.institute_id,
        subs[0],
        order.plan_id,
        order.cycle,
        now,
      );
      await c.query(
        "INSERT INTO billing_events (payment_id, provider, order_id, institute_id, plan_id, cycle, amount, net_amount, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?)",
        [
          p.paymentId,
          provider,
          order.id,
          order.institute_id,
          order.plan_id,
          order.cycle,
          p.amountPaise,
          p.amountPaise,
          next.expiresAt,
        ],
      );
      await queuePlanActive(
        c,
        order.institute_id,
        { paymentId: p.paymentId, planId: next.plan, expiresAt: next.expiresAt },
        now,
      );
      return 'applied' as const;
    });
  } catch (e) {
    if ((e as { code?: string }).code !== 'ER_DUP_ENTRY') throw e;
    // seen before: still refused if it was refused the first time
    const [ev] = (await pool.query('SELECT status FROM billing_events WHERE payment_id = ?', [
      p.paymentId,
    ])) as unknown as [{ status: string }[]];
    return ev[0]?.status === 'rejected' ? 'invalid' : 'duplicate';
  }
}

export type OrderState = 'paid' | 'pending' | 'failed';

/**
 * Asks the provider where one of OUR orders stands and, when it is paid, applies the plan (once). The return page, the
 * app, the owner's plan page and the reconcile job use it; Razorpay's signed webhook applies the same payment id, so
 * whichever comes first wins and the other is a no-op.
 */
export async function reconcileOrder(
  pool: Pool,
  provider: BillingProvider,
  where: { orderId?: string; linkId?: string; instituteId?: string },
  now: Date,
): Promise<{ orderId: string; state: OrderState; result?: PurchaseResult } | null> {
  if (!provider.checkStatus) return null;
  const [rows] = (await pool.query(
    `SELECT id, link_id FROM billing_orders WHERE provider = ? AND ${where.orderId ? 'id = ?' : 'link_id = ?'}${
      where.instituteId ? ' AND institute_id = ?' : ''
    }`,
    [
      provider.name,
      where.orderId ?? where.linkId,
      ...(where.instituteId ? [where.instituteId] : []),
    ],
  )) as unknown as [{ id: string; link_id: string }[]];
  const order = rows[0];
  if (!order) return null;
  // Already applied (or refused) for this order: no need to ask the provider again.
  const [done] = (await pool.query(
    'SELECT status FROM billing_events WHERE provider = ? AND order_id = ? ORDER BY created_at DESC LIMIT 1',
    [provider.name, order.id],
  )) as unknown as [{ status: 'applied' | 'rejected' }[]];
  if (done[0]?.status === 'applied')
    return { orderId: order.id, state: 'paid', result: 'duplicate' };
  // refused once (wrong amount): asking again must not turn it into "paid"
  if (done[0]?.status === 'rejected')
    return { orderId: order.id, state: 'failed', result: 'invalid' };
  let status;
  try {
    status = await provider.checkStatus(order.link_id);
  } catch (e) {
    throw Object.assign(new AppError(502, 'payment_provider_error'), { cause: e });
  }
  if (status.state === 'FAILED') return { orderId: order.id, state: 'failed' };
  if (status.state !== 'COMPLETED') return { orderId: order.id, state: 'pending' };
  const result = await applyPaid(
    pool,
    provider.name,
    {
      paymentId: status.paymentId ?? `${provider.name}_${order.link_id}`,
      linkId: order.link_id,
      amountPaise: status.amountPaise,
    },
    now,
  );
  return { orderId: order.id, state: result === 'invalid' ? 'failed' : 'paid', result };
}

/**
 * Asks the provider about recent orders that were neither applied nor refused yet (one centre's, or everyone's), so a
 * plan switches on even when the payer closed the browser before Razorpay sent them back and the webhook was missed.
 * Never throws. Returns how many were found paid.
 */
export async function reconcilePending(
  pool: Pool,
  provider: BillingProvider | null,
  where: { instituteId?: string; sinceMinutes: number },
  now: Date,
): Promise<number> {
  if (!provider?.checkStatus) return 0;
  try {
    const [rows] = (await pool.query(
      `SELECT o.id FROM billing_orders o
        WHERE o.provider = ? AND o.created_at > ?${where.instituteId ? ' AND o.institute_id = ?' : ''}
          AND NOT EXISTS (SELECT 1 FROM billing_events e WHERE e.provider = o.provider AND e.order_id = o.id)
        ORDER BY o.created_at DESC LIMIT 20`,
      [
        provider.name,
        new Date(now.getTime() - where.sinceMinutes * 60_000),
        ...(where.instituteId ? [where.instituteId] : []),
      ],
    )) as unknown as [{ id: string }[]];
    let paid = 0;
    for (const r of rows) {
      const res = await reconcileOrder(pool, provider, { orderId: r.id }, now).catch(() => null);
      if (res?.state === 'paid') paid++;
    }
    return paid;
  } catch {
    return 0;
  }
}

export async function billingHistory(pool: Pool, instituteId: string) {
  const [rows] = (await pool.query(
    "SELECT payment_id, provider, plan_id, cycle, amount, currency, status, expires_at, created_at FROM billing_events WHERE institute_id = ? AND status IN ('applied', 'refunded') ORDER BY created_at DESC, payment_id LIMIT 50",
    [instituteId],
  )) as unknown as [
    {
      payment_id: string;
      provider: string;
      plan_id: string;
      cycle: Cycle | null;
      amount: number;
      currency: string;
      status: 'applied' | 'refunded';
      expires_at: Date | null;
      created_at: Date;
    }[],
  ];
  return rows.map((r) => ({
    paymentId: r.payment_id,
    provider: r.provider,
    planId: r.plan_id,
    cycle: r.cycle,
    amountPaise: Number(r.amount),
    currency: r.currency,
    refunded: r.status === 'refunded',
    expiresAt: (r.expires_at ?? r.created_at).toISOString(),
    paidAt: r.created_at.toISOString(),
  }));
}

const STORE_CLEARED =
  'store = NULL, store_product = NULL, store_will_renew = NULL, store_issue = NULL, store_sandbox = 0, banked_plan = NULL, banked_cycle = NULL, banked_ms = NULL';

/**
 * The store subscription no longer decides the plan (it ended, was refunded or moved to another centre): the banked
 * days (trial or website plan) resume from now, or else the plan ends. Inside a transaction, the row locked.
 */
export async function leaveStore(
  c: PoolConnection | Pool,
  instituteId: string,
  row: SubRow,
  now: Date,
): Promise<{ plan: string; status: 'active' | 'expired'; expiresAt: Date }> {
  const banked = Number(row.banked_ms ?? 0);
  if (banked > 0 && row.banked_plan) {
    const plan = row.banked_plan;
    const limits = isPlanId(plan) ? PLANS[plan] : { studentLimit: null, batchLimit: null };
    const expiresAt = new Date(now.getTime() + banked);
    await c.query(
      `UPDATE subscriptions SET plan = ?, cycle = ?, status = 'active', starts_at = ?, expires_at = ?,
         student_limit = ?, batch_limit = ?, ${STORE_CLEARED} WHERE institute_id = ?`,
      [plan, row.banked_cycle, now, expiresAt, limits.studentLimit, limits.batchLimit, instituteId],
    );
    return { plan, status: 'active', expiresAt };
  }
  // ended on its own date, or cut short now (a refund, a move to another centre)
  const expiresAt = row.expires_at.getTime() < now.getTime() ? row.expires_at : now;
  await c.query(
    `UPDATE subscriptions SET status = 'expired', expires_at = ?, ${STORE_CLEARED} WHERE institute_id = ?`,
    [expiresAt, instituteId],
  );
  return { plan: row.plan, status: 'expired', expiresAt };
}

/**
 * Marks subscriptions past their end date as expired (data is kept; the app becomes read-only). A store subscription
 * that ran out without a word from the store (its renewal is checked by the store-resync job first) hands back to the
 * banked days, if any.
 */
export async function expireDueSubscriptions(pool: Pool, now: Date): Promise<number> {
  const [stale] = (await pool.query(
    "SELECT institute_id FROM subscriptions WHERE status = 'active' AND expires_at < ? AND store IS NOT NULL",
    [now],
  )) as unknown as [{ institute_id: string }[]];
  for (const r of stale)
    await withTransaction(pool, async (c) => {
      const [rows] = (await c.query(
        `SELECT ${SUB_COLUMNS} FROM subscriptions WHERE institute_id = ? FOR UPDATE`,
        [r.institute_id],
      )) as unknown as [SubRow[]];
      const row = rows[0];
      if (row?.store && row.status === 'active' && row.expires_at < now)
        await leaveStore(c, r.institute_id, row, now);
    });
  const [res] = (await pool.query(
    "UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND expires_at < ?",
    [now],
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}
