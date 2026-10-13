import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app.js';
import { confirmPhoneOwnership, requestOtp } from '../auth/otp.js';
import { parsePayToken } from '../billing/payLink.js';
import {
  clearPlanSessionCookie,
  planSessionCookie,
  readPlanSession,
} from '../billing/planSession.js';
import { PLANS, isPlanId, type Plan } from '../billing/plans.js';
import type { BillingProvider } from '../billing/provider.js';
import { billingHistory, createOrder } from '../billing/service.js';
import { activeCount } from '../institutes/limits.js';
import { maskPhone, normalizeIndianPhone } from '../lib/phone.js';
import type { MessageProvider } from '../messaging/provider.js';
import { orderUrls } from './billing.js';
import { PAY_CSS, PAY_CSS_HREF } from './payCss.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  billing: BillingProvider | null;
  provider?: MessageProvider | null;
  clock?: () => Date;
};

// No scripts at all; forms post back here, and the jump to the payment page is a redirect or a plain link.
const PAY_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rupees = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;
const day = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
const limit = (n: number | null, what: string) =>
  n === null ? `Unlimited ${what}` : `Up to ${n} ${what}`;
const planName = (id: string) => PLANS[id as Plan['id']]?.name ?? id;
const formBody = (body: unknown) => new URLSearchParams(typeof body === 'string' ? body : '');

interface Centre {
  id: string;
  name: string;
  owner_user_id: string;
  phone: string | null;
  plan: string | null;
  status: string | null;
  expires_at: Date | null;
  student_limit: number | null;
  batch_limit: number | null;
}
const CENTRE_SQL = `SELECT i.id, i.name, i.owner_user_id, u.phone, s.plan, s.status, s.expires_at, s.student_limit,
       s.batch_limit
  FROM institutes i JOIN users u ON u.id = i.owner_user_id
  LEFT JOIN subscriptions s ON s.institute_id = i.id`;

const GATEWAY: Record<string, string> = {
  cashfree: 'Cashfree Payments',
  phonepe: 'PhonePe',
  razorpay: 'Razorpay',
};

function page(
  title: string,
  body: string,
  opts: { refresh?: string; gateway?: string; nav?: string } = {},
): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${
    opts.refresh ? `<meta http-equiv="refresh" content="0;url=${esc(opts.refresh)}">` : ''
  }<title>${esc(title)} · Chalkpis</title><link rel="stylesheet" href="${PAY_CSS_HREF}"></head><body><main>
<header><picture><source srcset="/admin-logo/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/admin-logo/logo.svg" alt="Chalkpis" width="132" height="32"></picture>${opts.nav ?? ''}</header>
${body}
<footer>${opts.gateway && GATEWAY[opts.gateway] ? `Payments are processed securely by ${GATEWAY[opts.gateway]}. ` : ''}<a href="/terms">Terms</a> · <a href="/privacy">Privacy</a><br>© 2026 M2W Technologies Private Limited · <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a></footer>
</main></body></html>`;
}

function status(c: Centre, now: Date): string {
  if (!c.plan || !c.expires_at) return '<p class="status">No plan yet.</p>';
  const active = c.status === 'active' && c.expires_at.getTime() > now.getTime();
  const until = day(c.expires_at);
  if (!active)
    return `<p class="status ended">Your ${c.plan === 'trial' ? 'free trial' : 'plan'} ended on ${until}. Choose a plan to keep adding students, attendance and fees. Nothing you saved is lost.</p>`;
  if (c.plan === 'trial') return `<p class="status">Your free trial runs until ${until}.</p>`;
  return `<p class="status">${esc(planName(c.plan))} plan, active until ${until}. Paying now adds the new months after that date.</p>`;
}

/** The three plan cards; each Pay button posts the plan (plus any hidden fields) to `action`. */
function plansHtml(action: string | null, hidden: Record<string, string> = {}): string {
  const best = Math.min(...Object.values(PLANS).map((p) => p.pricePaise / p.months));
  const fields = Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return `<div class="plans">${Object.values(PLANS)
    .map((p) => {
      const isBest = p.pricePaise / p.months === best;
      return `<section class="plan${isBest ? ' best' : ''}">
${isBest ? '<span class="tag">Best value</span>' : ''}<h2>${esc(p.name)}</h2>
<p class="price">${rupees(p.pricePaise)} <span>for ${p.months} months</span></p>
<p class="per">About ₹${Math.round(p.pricePaise / p.months / 100)} a month</p>
<ul><li>${limit(p.studentLimit, 'students')}</li><li>${limit(p.batchLimit, 'batches')}</li><li>Attendance, fees, reports and WhatsApp updates to parents</li></ul>
${
  action
    ? `<form method="post" action="${esc(action)}">${fields}<input type="hidden" name="plan" value="${p.id}"><button type="submit">Pay ${rupees(p.pricePaise)}</button></form>`
    : ''
}</section>`;
    })
    .join('')}</div>`;
}

const PAYMENTS_OFF =
  '<p class="note">Online payment is not switched on yet. Write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a> and we will help you renew.</p>';
const PAY_FAILED =
  '<p class="note error">We could not open the payment page just now. Please try again in a minute, or write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a>.</p>';

/**
 * Where centres pay for their plan, outside the store apps (Apple and Google allow no other way to pay inside them):
 *
 * - tutor.chalkpis.com/plan: the billing page. The owner signs in with their mobile number and a WhatsApp code (no
 *   new account is ever made here), sees the plan, usage and past payments with receipts, and pays.
 * - tutor.chalkpis.com/pay/<token>: one centre's pay page without signing in, for links sent on WhatsApp.
 *
 * Paying opens the provider's hosted page; the plan switches on only once the provider confirms (see billing.ts).
 * Plain HTML and forms, no scripts.
 */
export function payRoutes(app: FastifyInstance, deps: Deps) {
  const now = () => (deps.clock ?? (() => new Date()))();
  const secure = (deps.config.PUBLIC_BASE_URL ?? '').startsWith('https://');
  const gateway = deps.billing?.name;
  const send = (reply: FastifyReply, code: number, html: string) =>
    reply
      .code(code)
      .header('Content-Security-Policy', PAY_CSP)
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(html);

  /** Creates (or reuses) the order and sends the payer on to the provider; an error comes back as a note. */
  const startPayment = async (
    req: FastifyRequest,
    reply: FastifyReply,
    c: Centre,
    planId: Plan['id'],
  ): Promise<string | null> => {
    try {
      const order = await createOrder(deps.pool, deps.billing!, {
        instituteId: c.id,
        userId: c.owner_user_id,
        planId,
        ownerPhone: c.phone ?? undefined,
        ...orderUrls(deps.config, deps.billing!),
      });
      if (!/^https:\/\//.test(order.url)) throw new Error('not-https');
      const plan = PLANS[planId];
      await send(
        reply,
        200,
        page(
          'Opening payment',
          `<h1>Opening the payment page…</h1><p>${esc(plan.name)} plan for ${esc(c.name)}: ${rupees(plan.pricePaise)} for ${plan.months} months.</p><p><a class="button" href="${esc(order.url)}">Continue to payment</a></p>`,
          { refresh: order.url, gateway },
        ),
      );
      return null;
    } catch (e) {
      const cause = (e as { cause?: unknown }).cause;
      req.log.warn(
        { err: e, reason: cause instanceof Error ? cause.message : undefined },
        'pay page: payment link failed',
      );
      return PAY_FAILED;
    }
  };

  // The banner WhatsApp shows above plan reminders (the gateway fetches it by this address).
  const banner = readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'plan-renew.png'),
  );
  app.get('/plan-renew.png', async (_req, reply) =>
    reply.header('Cache-Control', 'public, max-age=86400').type('image/png').send(banner),
  );

  app.get('/pay.css', async (_req, reply) =>
    reply
      .header('Cache-Control', 'public, max-age=3600')
      .type('text/css; charset=utf-8')
      .send(PAY_CSS),
  );

  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 2048 },
      (_req, body, done) => done(null, body),
    );

    // ---- /pay/<token>: one centre, no sign-in ----

    const byToken = async (token: string): Promise<Centre | null> => {
      const id = parsePayToken(deps.config.JWT_SECRET, token);
      if (!id) return null;
      const [rows] = (await deps.pool.query(`${CENTRE_SQL} WHERE i.id = ?`, [id])) as unknown as [
        Centre[],
      ];
      return rows[0] ?? null;
    };
    const tokenNotFound = (reply: FastifyReply) =>
      send(
        reply,
        404,
        page(
          'Link not found',
          '<h1>This payment link does not work</h1><p>Sign in on <a href="/plan">tutor.chalkpis.com/plan</a> with your mobile number to see your plan and pay, or write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a>.</p>',
        ),
      );
    const tokenView = (token: string, c: Centre, note = '') =>
      page(
        `Plans for ${c.name}`,
        `<h1>Choose a plan</h1><p class="centre">${esc(c.name)}</p>${status(c, now())}${note}${
          deps.billing ? '' : PAYMENTS_OFF
        }${plansHtml(deps.billing ? `/pay/${token}` : null)}<p class="small">One payment, no auto-renewal. Pay by UPI, card or net banking. <a href="/plan">Sign in</a> to see past payments and receipts.</p>`,
        { gateway },
      );

    scope.get<{ Params: { token: string } }>('/pay/:token', async (req, reply) => {
      const c = await byToken(req.params.token);
      if (!c) return tokenNotFound(reply);
      return send(reply, 200, tokenView(req.params.token, c));
    });

    scope.post<{ Params: { token: string } }>(
      '/pay/:token',
      { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const c = await byToken(req.params.token);
        if (!c) return tokenNotFound(reply);
        const planId = formBody(req.body).get('plan');
        if (!deps.billing || !isPlanId(planId))
          return send(reply, 400, tokenView(req.params.token, c));
        const failed = await startPayment(req, reply, c, planId);
        if (failed) return send(reply, 502, tokenView(req.params.token, c, failed));
        return reply;
      },
    );

    // ---- /plan: the billing page, signed in with a WhatsApp code ----

    const otpDeps = {
      pool: deps.pool,
      config: deps.config,
      provider: deps.provider ?? null,
      clock: deps.clock,
    };
    const signedIn = async (req: FastifyRequest): Promise<string | null> => {
      const userId = readPlanSession(deps.config.JWT_SECRET, req.headers.cookie, now().getTime());
      if (!userId) return null;
      const [u] = (await deps.pool.query('SELECT blocked_at FROM users WHERE id = ?', [
        userId,
      ])) as unknown as [{ blocked_at: Date | null }[]];
      return u[0] && !u[0].blocked_at ? userId : null;
    };
    const ownedCentres = async (userId: string) =>
      (
        (await deps.pool.query(`${CENTRE_SQL} WHERE i.owner_user_id = ? ORDER BY i.created_at`, [
          userId,
        ])) as unknown as [Centre[]]
      )[0];
    /** A cross-site form must not act for a signed-in owner (the cookie is SameSite=Lax as well). */
    const sameOrigin = (req: FastifyRequest) => {
      const origin = req.headers.origin;
      if (!origin || origin === 'null') return true;
      const base = deps.config.PUBLIC_BASE_URL;
      return !base || new URL(base).origin === origin;
    };

    const signInPage = (note = '', phone = '') =>
      page(
        'Your plan',
        `<h1>Your Chalkpis plan</h1><p>Sign in with the mobile number you use in the Chalkpis app. We will send a code on WhatsApp.</p>${note}<form class="signin" method="post" action="/plan/code"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="16" required value="${esc(phone)}" placeholder="98765 43210"><button type="submit">Send code on WhatsApp</button></form>`,
      );
    const codePage = (phone: string, note = '') =>
      page(
        'Enter the code',
        `<h1>Enter the code</h1><p>We sent a 6-digit code on WhatsApp to ${esc(maskPhone(phone))}.</p>${note}<form class="signin" method="post" action="/plan/verify"><input type="hidden" name="phone" value="${esc(phone)}"><label for="code">Code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus><button type="submit">Sign in</button></form><p class="small"><a href="/plan">Use another number</a></p>`,
      );
    const signOutNav =
      '<form class="nav" method="post" action="/plan/logout"><button type="submit" class="link">Sign out</button></form>';

    const accountPage = async (centres: Centre[], selected: Centre, note = '') => {
      const c = selected;
      const [students, batches, history] = await Promise.all([
        activeCount(deps.pool, 'students', c.id),
        activeCount(deps.pool, 'batches', c.id),
        billingHistory(deps.pool, c.id),
      ]);
      const meter = (label: string, used: number, max: number | null) =>
        `<div class="meter"><span>${label}</span><strong>${max === null ? `${used} (unlimited)` : `${used} / ${max}`}</strong></div>`;
      const switcher =
        centres.length > 1
          ? `<p class="small">Your centres: ${centres
              .map((x) =>
                x.id === c.id
                  ? `<strong>${esc(x.name)}</strong>`
                  : `<a href="/plan?centre=${x.id}">${esc(x.name)}</a>`,
              )
              .join(' · ')}</p>`
          : '';
      const rows = history.length
        ? `<table class="history"><thead><tr><th>Paid on</th><th>Plan</th><th>Amount</th><th>Valid until</th><th></th></tr></thead><tbody>${history
            .map(
              (h) =>
                `<tr><td>${day(new Date(h.paidAt))}</td><td>${esc(planName(h.planId))}</td><td>${rupees(h.amountPaise)}</td><td>${day(new Date(h.expiresAt))}</td><td><a href="/plan/receipt/${encodeURIComponent(h.paymentId)}?centre=${c.id}">Receipt</a></td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="small">No payments yet.</p>';
      return page(
        `Plan for ${c.name}`,
        `<h1>${esc(c.name)}</h1>${switcher}${status(c, now())}${note}
<section class="usage">${meter('Students', students, c.student_limit)}${meter('Batches', batches, c.batch_limit)}</section>
<h2 class="section">Choose a plan</h2>${deps.billing ? '' : PAYMENTS_OFF}${plansHtml(deps.billing ? '/plan/pay' : null, { centre: c.id })}
<p class="small">One payment, no auto-renewal. Pay by UPI, card or net banking.</p>
<h2 class="section">Payments</h2>${rows}`,
        { gateway, nav: signOutNav },
      );
    };
    const pick = (centres: Centre[], id: string | null) =>
      centres.find((x) => x.id === id) ?? centres[0];
    const noCentre = page(
      'No centre',
      '<h1>No centre on this number</h1><p>Only the owner of a centre can see and pay for its plan. Sign up in the Chalkpis app first, or sign in with the owner&#39;s mobile number.</p><p><a class="button" href="/plan">Use another number</a></p>',
      { nav: signOutNav },
    );

    scope.get<{ Querystring: { centre?: string } }>('/plan', async (req, reply) => {
      const userId = await signedIn(req);
      if (!userId) return send(reply, 200, signInPage());
      const centres = await ownedCentres(userId);
      if (!centres.length) return send(reply, 200, noCentre);
      return send(reply, 200, await accountPage(centres, pick(centres, req.query.centre ?? null)!));
    });

    scope.post(
      '/plan/code',
      { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const raw = formBody(req.body).get('phone') ?? '';
        const phone = normalizeIndianPhone(raw);
        if (!phone)
          return send(
            reply,
            400,
            signInPage(
              '<p class="note error">Enter a 10-digit Indian mobile number.</p>',
              raw.slice(0, 16),
            ),
          );
        const r = await requestOtp(otpDeps, phone);
        if (r.ok) return send(reply, 200, codePage(phone));
        if (r.error === 'too_soon') return send(reply, 200, codePage(phone)); // the last code still works
        const why =
          r.error === 'too_many'
            ? 'Too many codes for this number. Please try again in an hour.'
            : 'We could not send a code just now. Please try again in a few minutes.';
        return send(
          reply,
          r.error === 'too_many' ? 429 : 503,
          signInPage(`<p class="note error">${why}</p>`, raw.slice(0, 16)),
        );
      },
    );

    scope.post(
      '/plan/verify',
      { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const f = formBody(req.body);
        const phone = normalizeIndianPhone(f.get('phone') ?? '');
        if (!phone) return reply.redirect('/plan', 303);
        // checks the code without ever creating an account
        const r = await confirmPhoneOwnership(otpDeps, phone, (f.get('code') ?? '').trim());
        if (!r.ok)
          return send(
            reply,
            401,
            codePage(
              phone,
              '<p class="note error">That code is not right or has expired. Check WhatsApp and try again.</p>',
            ),
          );
        if (!r.userId) return send(reply, 200, noCentre);
        return reply
          .header(
            'Set-Cookie',
            planSessionCookie(deps.config.JWT_SECRET, r.userId, now().getTime(), secure),
          )
          .redirect('/plan', 303);
      },
    );

    scope.post(
      '/plan/pay',
      { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const userId = await signedIn(req);
        if (!userId || !sameOrigin(req)) return reply.redirect('/plan', 303);
        const f = formBody(req.body);
        const centres = await ownedCentres(userId);
        const c = centres.find((x) => x.id === f.get('centre'));
        const planId = f.get('plan');
        if (!c || !deps.billing || !isPlanId(planId)) return reply.redirect('/plan', 303);
        const failed = await startPayment(req, reply, c, planId);
        if (failed) return send(reply, 502, await accountPage(centres, c, failed));
        return reply;
      },
    );

    scope.get<{ Params: { id: string }; Querystring: { centre?: string } }>(
      '/plan/receipt/:id',
      async (req, reply) => {
        const userId = await signedIn(req);
        if (!userId) return reply.redirect('/plan', 303);
        const c = (await ownedCentres(userId)).find((x) => x.id === req.query.centre);
        const h =
          c && (await billingHistory(deps.pool, c.id)).find((x) => x.paymentId === req.params.id);
        if (!c || !h)
          return send(
            reply,
            404,
            page(
              'Receipt not found',
              '<h1>Receipt not found</h1><p><a href="/plan">Back to your plan</a></p>',
            ),
          );
        const plan = PLANS[h.planId as Plan['id']];
        return send(
          reply,
          200,
          page(
            'Payment receipt',
            `<article class="receipt"><h1>Payment receipt</h1>
<dl><dt>Received from</dt><dd>${esc(c.name)}${c.phone ? `<br>${esc(maskPhone(c.phone))}` : ''}</dd>
<dt>For</dt><dd>Chalkpis ${esc(planName(h.planId))} plan${plan ? ` (${plan.months} months)` : ''}</dd>
<dt>Valid until</dt><dd>${day(new Date(h.expiresAt))}</dd>
<dt>Amount paid</dt><dd><strong>${rupees(h.amountPaise)}</strong></dd>
<dt>Paid on</dt><dd>${day(new Date(h.paidAt))}</dd>
<dt>Payment ID</dt><dd class="mono">${esc(h.paymentId)}</dd>
<dt>Paid through</dt><dd>${esc(GATEWAY[h.provider] ?? h.provider)}</dd></dl>
<p class="small">Issued by M2W Technologies Private Limited, the company behind Chalkpis · hello@chalkpis.com. To save a copy, use your browser's Print or Share.</p>
<p class="noprint"><a href="/plan?centre=${c.id}">Back to your plan</a></p></article>`,
          ),
        );
      },
    );

    scope.post('/plan/logout', async (req, reply) =>
      reply.header('Set-Cookie', clearPlanSessionCookie(secure)).redirect('/plan', 303),
    );
  });
}
