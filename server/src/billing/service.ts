import { AppError } from '../errors.js';
import { withTransaction, type Pool } from '../db.js';
import { newId } from '../lib/ids.js';
import { PLANS, computeSubscription, type PlanId } from './plans.js';
import type { BillingProvider, PaidEvent } from './provider.js';

export type PurchaseResult = 'applied' | 'duplicate' | 'invalid';

/** Asks the provider for a payment link and remembers it as our own order. Works even when the plan has expired. */
export async function createOrder(
  pool: Pool,
  provider: BillingProvider,
  a: { instituteId: string; userId: string; planId: PlanId; ownerPhone?: string },
) {
  const plan = PLANS[a.planId];
  const orderId = newId();
  let link;
  try {
    link = await provider.createPaymentLink({
      amountPaise: plan.pricePaise,
      description: `Chalkpis ${plan.name} plan (${plan.months} months)`,
      referenceId: orderId,
      customerPhone: a.ownerPhone,
    });
  } catch {
    throw new AppError(502, 'payment_provider_error');
  }
  await pool.query(
    'INSERT INTO billing_orders (id, institute_id, plan_id, amount, provider, link_id, url, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [orderId, a.instituteId, a.planId, plan.pricePaise, provider.name, link.id, link.url, a.userId],
  );
  return { orderId, url: link.url, planId: a.planId, amountPaise: plan.pricePaise };
}

/**
 * Applies a paid plan exactly once. The order comes from OUR table (looked up by the provider's link id), so the
 * plan, the institute and the price cannot be forged by whoever sends the webhook. A repeated delivery is
 * 'duplicate' (the payment id is the primary key); an unknown link or a wrong amount is recorded and refused.
 */
export async function applyPaid(
  pool: Pool,
  provider: 'razorpay' | 'mock',
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
        'SELECT status, expires_at FROM subscriptions WHERE institute_id = ? FOR UPDATE',
        [order.institute_id],
      )) as unknown as [{ status: string; expires_at: Date }[]];
      const next = computeSubscription(
        subs[0] ? { status: subs[0].status, expiresAt: subs[0].expires_at } : undefined,
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
      return 'applied' as const;
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_DUP_ENTRY') return 'duplicate';
    throw e;
  }
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
