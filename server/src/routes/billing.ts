import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { PLANS, isPlanId, type PlanId } from '../billing/plans.js';
import {
  cashfreeOrderId,
  parsePaymentLinkPaid,
  phonePeOrderId,
  verifyCashfreeSignature,
  verifyPhonePeAuth,
  verifyWebhookSignature,
  type BillingProvider,
} from '../billing/provider.js';
import {
  applyPaid,
  billingHistory,
  createOrder,
  reconcileOrder,
  type OrderState,
} from '../billing/service.js';
import { AppError } from '../errors.js';
import { parse } from '../lib/params.js';
import { PAY_CSS_HREF } from './payCss.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  billing: BillingProvider | null;
  clock?: () => Date;
};

const linkBody = z.object({ planId: z.string().refine(isPlanId, { message: 'plan' }) });

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
// The checkout page runs Cashfree's own script, which opens Cashfree's payment page; nothing else may load.
const CHECKOUT_CSP =
  "default-src 'none'; script-src 'self' https://sdk.cashfree.com; connect-src https://*.cashfree.com; frame-src https://*.cashfree.com; form-action https://*.cashfree.com; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'";
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The return page and (for Cashfree) the webhook address for a new order; none without a public https address. */
export function orderUrls(
  config: AppDeps['config'],
  billing: BillingProvider,
): { returnUrl?: (orderId: string) => string; notifyUrl?: string } {
  const base = config.PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!base) return {};
  return {
    returnUrl: (id) => `${base}/billing/return?order=${id}`,
    ...(billing.name === 'cashfree' && base.startsWith('https://')
      ? { notifyUrl: `${base}/billing/webhooks/cashfree` }
      : {}),
  };
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
  app.get('/billing', owner, async (req) => ({
    history: await billingHistory(deps.pool, req.auth!.instituteId!),
  }));

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
        ...orderUrls(deps.config, deps.billing),
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

  // Where PhonePe or Cashfree sends the payer back. Public (the browser has no app token), so it only reports and
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

  // Our checkout page for a Cashfree order: it opens Cashfree's hosted payment page with the order's payment session.
  // Public (the payer comes from the pay page or the web app, without an app token); the order id is a random UUID.
  const checkoutJs = readFileSync(path.join(PUBLIC_DIR, 'checkout.js'), 'utf8');
  app.get('/billing/checkout.js', async (_req, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=300')
      .type('text/javascript; charset=utf-8')
      .send(checkoutJs),
  );
  app.get('/billing/checkout/:id', async (req, reply) => {
    const send = (code: number, title: string, body: string, scripts = '') =>
      reply
        .code(code)
        .header('Content-Security-Policy', CHECKOUT_CSP)
        .header('Referrer-Policy', 'no-referrer')
        .header('X-Robots-Tag', 'noindex, nofollow')
        .header('Cache-Control', 'no-store')
        .type('text/html; charset=utf-8')
        .send(
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · Chalkpis</title><link rel="stylesheet" href="${PAY_CSS_HREF}"></head><body><main><header><picture><source srcset="/admin-logo/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/admin-logo/logo.svg" alt="Chalkpis" width="132" height="32"></picture></header>${body}<footer>Payments are processed securely by Cashfree Payments. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer></main>${scripts}</body></html>`,
        );
    const q = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const provider = deps.billing;
    if (!q.success || !provider?.checkoutSession)
      return send(
        404,
        'Order not found',
        '<h1>Order not found</h1><p>Open your Chalkpis payment link again to start a new payment.</p>',
      );
    const [rows] = (await deps.pool.query(
      `SELECT o.link_id, o.plan_id, o.amount, i.name FROM billing_orders o JOIN institutes i ON i.id = o.institute_id
        WHERE o.id = ? AND o.provider = ?`,
      [q.data.id, provider.name],
    )) as unknown as [{ link_id: string; plan_id: PlanId; amount: number; name: string }[]];
    const order = rows[0];
    if (!order)
      return send(
        404,
        'Order not found',
        '<h1>Order not found</h1><p>Open your Chalkpis payment link again to start a new payment.</p>',
      );
    let session;
    try {
      session = await provider.checkoutSession(order.link_id);
    } catch (e) {
      req.log.warn({ err: e }, 'checkout: payment session failed');
      return send(
        502,
        'Payment page unavailable',
        '<h1>The payment page did not open</h1><p>Please try again in a minute, or write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a>.</p>',
      );
    }
    // Paid, expired or cancelled: the return page asks Cashfree and says which.
    if (!session) return reply.redirect(`/billing/return?order=${q.data.id}`, 303);
    const plan = PLANS[order.plan_id];
    return send(
      200,
      'Opening payment',
      `<h1>Opening the secure payment page…</h1><p class="centre">${esc(order.name)}</p><p>${esc(plan.name)} plan: ₹${(Number(order.amount) / 100).toLocaleString('en-IN')} for ${plan.months} months.</p><p><button type="button" id="pay" data-session="${esc(session.sessionId)}" data-mode="${session.mode}">Continue to payment</button></p><p class="note error" id="fail" hidden>The payment page did not open. Check your internet connection and press the button again.</p><noscript><p class="note error">Turn on JavaScript in your browser to open the payment page.</p></noscript>`,
      '<script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script><script src="/billing/checkout.js"></script>',
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

    // PhonePe: the webhook is only a nudge. After checking its Authorization header, we ask PhonePe for the order's
    // status and apply the plan from that answer, so a forged or replayed body can never activate a plan.
    hook.post('/billing/webhooks/phonepe', async (req, reply) => {
      const { PHONEPE_WEBHOOK_USERNAME: user, PHONEPE_WEBHOOK_PASSWORD: pass } = deps.config;
      if (!user || !pass || deps.billing?.name !== 'phonepe')
        return reply.code(503).send({ error: 'webhook_unavailable' });
      const auth = req.headers.authorization;
      if (!verifyPhonePeAuth(typeof auth === 'string' ? auth : undefined, user, pass))
        return reply.code(401).send({ error: 'bad_signature' });
      let json: unknown;
      try {
        json = JSON.parse(typeof req.body === 'string' ? req.body : '');
      } catch {
        return reply.code(400).send({ error: 'bad_request' });
      }
      const linkId = phonePeOrderId(json);
      if (!linkId) return { ok: true, ignored: true }; // refunds and other events: acknowledge
      const r = await reconcileOrder(deps.pool, deps.billing, { linkId }, now());
      return { ok: true, state: r?.state ?? 'unknown' };
    });

    // Cashfree: the same idea. The signature (timestamp + raw body, keyed with our secret key) keeps strangers from
    // making us call Cashfree; the plan itself is applied only from Cashfree's own answer about the order.
    hook.post('/billing/webhooks/cashfree', async (req, reply) => {
      const secret = deps.config.CASHFREE_SECRET_KEY;
      if (!secret || deps.billing?.name !== 'cashfree')
        return reply.code(503).send({ error: 'webhook_unavailable' });
      const raw = typeof req.body === 'string' ? req.body : '';
      const ts = req.headers['x-webhook-timestamp'];
      const sig = req.headers['x-webhook-signature'];
      if (
        !verifyCashfreeSignature(
          raw,
          typeof ts === 'string' ? ts : undefined,
          typeof sig === 'string' ? sig : undefined,
          secret,
        )
      )
        return reply.code(401).send({ error: 'bad_signature' });
      const linkId = cashfreeOrderId(raw);
      if (!linkId) return { ok: true, ignored: true }; // other events: acknowledge so they are not retried
      const r = await reconcileOrder(deps.pool, deps.billing, { linkId }, now());
      return { ok: true, state: r?.state ?? 'unknown' };
    });
  });
}
