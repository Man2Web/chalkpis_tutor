import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { PLANS, isPlanId } from '../billing/plans.js';
import {
  parsePaymentLinkPaid,
  verifyWebhookSignature,
  type BillingProvider,
} from '../billing/provider.js';
import {
  applyPaid,
  billingHistory,
  createOrder,
  reconcileOrder,
  reconcilePending,
  type OrderState,
} from '../billing/service.js';
import { AppError } from '../errors.js';
import { parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  billing: BillingProvider | null;
  clock?: () => Date;
};

const linkBody = z.object({ planId: z.string().refine(isPlanId, { message: 'plan' }) });

/** The return page for a new order; none without a public address. */
export function orderUrls(config: AppDeps['config']): { returnUrl?: (orderId: string) => string } {
  const base = config.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) return {};
  return { returnUrl: (id) => `${base}/billing/return?order=${id}` };
}
const mockBody = z.object({ orderId: z.string().uuid() });

export function billingRoutes(app: FastifyInstance, deps: Deps) {
  const read = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const owner = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();

  // `paymentsAvailable` is false while no payment provider is set up: the app then hides the buy buttons.
  app.get('/billing/plans', read, async () => ({
    plans: Object.values(PLANS),
    paymentsAvailable: !!deps.billing,
  }));
  app.get('/billing', owner, async (req) => {
    // a payment made on the website but never confirmed back (browser closed, webhook missed) is picked up here
    await reconcilePending(
      deps.pool,
      deps.billing,
      { instituteId: req.auth!.instituteId!, sinceMinutes: 24 * 60 },
      now(),
    );
    return { history: await billingHistory(deps.pool, req.auth!.instituteId!) };
  });

  // Buying a plan must work while expired, so there is no plan check here.
  app.post(
    '/billing/links',
    {
      ...owner,
      config: {
        rateLimit: {
          max: Math.max(10, Math.floor(deps.config.RATE_LIMIT_PER_MIN / 30)),
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      if (!deps.billing) throw new AppError(503, 'billing_unavailable');
      const { planId } = parse(linkBody, req.body) as { planId: 'starter' | 'standard' | 'pro' };
      const [u] = (await deps.pool.query('SELECT phone FROM users WHERE id = ?', [
        req.auth!.userId,
      ])) as unknown as [{ phone: string }[]];
      const order = await createOrder(deps.pool, deps.billing, {
        instituteId: req.auth!.instituteId!,
        userId: req.auth!.userId,
        planId,
        ownerPhone: u[0]?.phone,
        ...orderUrls(deps.config),
        now: now(),
      });
      return reply.code(201).send(order);
    },
  );

  // The app asks this after the owner comes back from the checkout page; it confirms with the provider itself.
  app.get('/billing/orders/:id', owner, async (req) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), req.params);
    if (!deps.billing?.checkStatus) throw new AppError(404, 'not_found');
    const r = await reconcileOrder(
      deps.pool,
      deps.billing,
      { orderId: id, instituteId: req.auth!.instituteId! },
      now(),
    );
    if (!r) throw new AppError(404, 'not_found');
    return { orderId: r.orderId, state: r.state };
  });

  // Where Razorpay sends the payer back (with its own query values, which are ignored). Public (the browser has no app
  // token), so it only reports and
  // confirms: whatever it shows comes from asking the provider, never from the URL.
  app.get('/billing/return', async (req, reply) => {
    const q = z.object({ order: z.string().uuid() }).safeParse(req.query);
    let state: OrderState | 'unknown' = 'unknown';
    if (q.success && deps.billing?.checkStatus) {
      try {
        state =
          (await reconcileOrder(deps.pool, deps.billing, { orderId: q.data.order }, now()))
            ?.state ?? 'unknown';
      } catch {
        state = 'pending';
      }
    }
    const text = {
      paid: [
        'Payment received',
        'Your Chalkpis plan is active. You can close this page and go back to the app.',
      ],
      pending: [
        'Payment in progress',
        'We are waiting for the bank to confirm. This page and the app update on their own once it does; it usually takes a few seconds.',
      ],
      failed: [
        'Payment did not go through',
        'No money was taken for this plan. Open your payment link again to try once more.',
      ],
      unknown: ['Order not found', 'Open your Chalkpis payment link again to start a new payment.'],
    }[state];
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${state === 'pending' ? '<meta http-equiv="refresh" content="5">' : ''}<title>${text[0]} · Chalkpis</title><link rel="stylesheet" href="/legal.css"></head><body><main><h1>${text[0]}</h1><p>${text[1]}</p></main></body></html>`,
      );
  });

  // Local try-out only: pretends the owner paid. It exists only when the mock provider is in use.
  if (deps.billing?.name === 'mock') {
    app.post('/billing/mock/complete', owner, async (req) => {
      const { orderId } = parse(mockBody, req.body);
      const [rows] = (await deps.pool.query(
        'SELECT link_id, amount FROM billing_orders WHERE id = ? AND institute_id = ? AND provider = ?',
        [orderId, req.auth!.instituteId, 'mock'],
      )) as unknown as [{ link_id: string; amount: number }[]];
      if (!rows[0]) throw new AppError(404, 'not_found');
      const result = await applyPaid(
        deps.pool,
        'mock',
        {
          paymentId: `mock_pay_${orderId}`,
          linkId: rows[0].link_id,
          amountPaise: Number(rows[0].amount),
        },
        now(),
      );
      return { result };
    });
  }

  // The webhook is its own scope so it can read the raw body (the signature is over the exact bytes).
  void app.register(async (hook) => {
    hook.removeContentTypeParser('application/json'); // this scope keeps the raw text
    hook.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) =>
      done(null, body),
    );
    hook.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_req, body, done) => done(null, body),
    );
    hook.post('/billing/webhooks/razorpay', async (req, reply) => {
      const secret = deps.config.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) return reply.code(503).send({ error: 'webhook_unavailable' });
      const raw = typeof req.body === 'string' ? req.body : '';
      const sig = req.headers['x-razorpay-signature'];
      if (!verifyWebhookSignature(raw, typeof sig === 'string' ? sig : undefined, secret))
        return reply.code(401).send({ error: 'bad_signature' });
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return reply.code(400).send({ error: 'bad_request' });
      }
      const paid = parsePaymentLinkPaid(json);
      if (!paid) return { ok: true, ignored: true }; // some other event: acknowledge so it is not retried
      return { ok: true, result: await applyPaid(deps.pool, 'razorpay', paid, now()) };
    });
  });
}
