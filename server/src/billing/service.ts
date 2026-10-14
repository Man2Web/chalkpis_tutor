import { AppError } from '../errors.js';
import { withTransaction, type Pool } from '../db.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { queuePlanActive } from '../messaging/centreMessages.js';
import { PLANS, computeSubscription, planChange, type PlanId } from './plans.js';
import type { BillingProvider, PaidEvent, ProviderName } from './provider.js';

export type PurchaseResult = 'applied' | 'duplicate' | 'invalid';

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
    ownerPhone?: string;
    /** The page the payer returns to, given our order id. */
    returnUrl?: (orderId: string) => string;
    /** Where the provider sends its webhook, for providers that take it per order (Cashfree). */
    notifyUrl?: string;
    now?: Date;
  },
) {
  return withNamedLock(pool, `billing:${a.instituteId}`, async (conn) => {
    const plan = PLANS[a.planId];
    const [cur] = (await conn.query(
      'SELECT plan, status, expires_at FROM subscriptions WHERE institute_id = ?',
      [a.instituteId],
    )) as unknown as [{ plan: string; status: string; expires_at: Date }[]];
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
      WHERE o.institute_id = ? AND o.plan_id = ? AND o.provider = ? AND o.created_at > NOW(3) - INTERVAL 15 MINUTE
        AND NOT EXISTS (SELECT 1 FROM billing_events e WHERE e.order_id = o.id)
      ORDER BY o.created_at DESC LIMIT 1`,
      [a.instituteId, a.planId, provider.name],
    )) as unknown as [{ id: string; url: string }[]];
    if (recent[0])
      return {
        orderId: recent[0].id,
        url: recent[0].url,
        planId: a.planId,
        amountPaise: plan.pricePaise,
      };
    const orderId = newId();
    let link;
    try {
      link = await provider.createPaymentLink({
        amountPaise: plan.pricePaise,
        description: `Chalkpis ${plan.name} plan (${plan.months} months)`,
        referenceId: orderId,
        customerPhone: a.ownerPhone,
        returnUrl: a.returnUrl?.(orderId),
        notifyUrl: a.notifyUrl,
      });
    } catch (e) {
      // the provider's own reason stays on the error (for the server log), never in the answer to the client
      throw Object.assign(new AppError(502, 'payment_provider_error'), { cause: e });
    }
    await conn.query(
      'INSERT INTO billing_orders (id, institute_id, plan_id, amount, provider, link_id, url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        orderId,
        a.instituteId,
        a.planId,
        plan.pricePaise,
        provider.name,
        link.id,
        link.url,
        a.userId,
      ],
    );
    return { orderId, url: link.url, planId: a.planId, amountPaise: plan.pricePaise };
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
        'SELECT id, institute_id, plan_id, amount FROM billing_orders WHERE provider = ? AND link_id = ?',
        [provider, p.linkId],
      )) as unknown as [{ id: string; institute_id: string; plan_id: PlanId; amount: number }[]];
      const order = orders[0];
      const reject = async (reason: string) => {
        await c.query(
          "INSERT INTO billing_events (payment_id, provider, order_id, institute_id, plan_id, amount, status, reason) VALUES (?, ?, ?, ?, ?, ?, 'rejected', ?)",
          [
            p.paymentId,
            provider,
            order?.id ?? null,
            order?.institute_id ?? null,
            order?.plan_id ?? null,
            p.amountPaise,
            reason,
          ],
        );
        return 'invalid' as const;
      };
      if (!order) return reject('unknown_link');
      if (
        Number(order.amount) !== p.amountPaise ||
        PLANS[order.plan_id].pricePaise !== p.amountPaise
      )
        return reject('amount_mismatch');

      const [subs] = (await c.query(
        'SELECT plan, status, expires_at FROM subscriptions WHERE institute_id = ? FOR UPDATE',
        [order.institute_id],
      )) as unknown as [{ plan: string; status: string; expires_at: Date }[]];
      const next = computeSubscription(
        subs[0]
          ? { plan: subs[0].plan, status: subs[0].status, expiresAt: subs[0].expires_at }
          : undefined,
        order.plan_id,
        now,
      );
      await c.query(
        "INSERT INTO billing_events (payment_id, provider, order_id, institute_id, plan_id, amount, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'applied', ?)",
        [
          p.paymentId,
          provider,
          order.id,
          order.institute_id,
          order.plan_id,
          p.amountPaise,
          next.expiresAt,
        ],
      );
      await c.query(
        `INSERT INTO subscriptions (institute_id, plan, status, starts_at, expires_at, student_limit, batch_limit)
         VALUES (?, ?, 'active', ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE plan = VALUES(plan), status = 'active', starts_at = VALUES(starts_at),
           expires_at = VALUES(expires_at), student_limit = VALUES(student_limit), batch_limit = VALUES(batch_limit)`,
        [
          order.institute_id,
          next.plan,
          next.startsAt,
          next.expiresAt,
          next.studentLimit,
          next.batchLimit,
        ],
      );
      await queuePlanActive(
        c,
        order.institute_id,
        { paymentId: p.paymentId, planId: next.plan as PlanId, expiresAt: next.expiresAt },
        now,
      );
      return 'applied' as const;
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return 'duplicate';
    throw e;
  }
}

export type OrderState = 'paid' | 'pending' | 'failed';

/**
 * Asks the provider where one of OUR orders stands and, when it is paid, applies the plan (once). This is the only
 * way a PhonePe or Cashfree payment is applied: the webhook, the return page and the app all just ask for it.
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

export async function billingHistory(pool: Pool, instituteId: string) {
  const [rows] = (await pool.query(
    "SELECT payment_id, provider, plan_id, amount, expires_at, created_at FROM billing_events WHERE institute_id = ? AND status = 'applied' ORDER BY created_at DESC, payment_id LIMIT 50",
    [instituteId],
  )) as unknown as [
    {
      payment_id: string;
      provider: string;
      plan_id: string;
      amount: number;
      expires_at: Date;
      created_at: Date;
    }[],
  ];
  return rows.map((r) => ({
    paymentId: r.payment_id,
    provider: r.provider,
    planId: r.plan_id,
    amountPaise: Number(r.amount),
    expiresAt: r.expires_at.toISOString(),
    paidAt: r.created_at.toISOString(),
  }));
}

/** Marks subscriptions past their end date as expired (data is kept; the app becomes read-only). */
export async function expireDueSubscriptions(pool: Pool, now: Date): Promise<number> {
  const [res] = (await pool.query(
    "UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND expires_at < ?",
    [now],
  )) as unknown as [{ affectedRows: number }];
  return res.affectedRows;
}
