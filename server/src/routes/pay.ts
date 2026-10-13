import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDeps } from '../app.js';
import { parsePayToken } from '../billing/payLink.js';
import { PLANS, isPlanId, type Plan } from '../billing/plans.js';
import type { BillingProvider } from '../billing/provider.js';
import { createOrder } from '../billing/service.js';
import { orderUrls } from './billing.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  billing: BillingProvider | null;
  clock?: () => Date;
};

// No scripts at all; the only form posts back here, and the jump to the payment page is a plain link.
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

interface Centre {
  name: string;
  owner_user_id: string;
  phone: string | null;
  plan: string | null;
  status: string | null;
  expires_at: Date | null;
}

const GATEWAY: Record<string, string> = {
  cashfree: 'Cashfree Payments',
  phonepe: 'PhonePe',
  razorpay: 'Razorpay',
};

function page(title: string, body: string, refresh?: string, gateway?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">${
    refresh ? `<meta http-equiv="refresh" content="0;url=${esc(refresh)}">` : ''
  }<title>${esc(title)} · Chalkpis</title><link rel="stylesheet" href="/pay.css"></head><body><main>
<header><picture><source srcset="/admin-logo/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/admin-logo/logo.svg" alt="Chalkpis" width="132" height="32"></picture></header>
${body}
<footer>${gateway && GATEWAY[gateway] ? `Payments are processed securely by ${GATEWAY[gateway]}. ` : ''}<a href="/terms">Terms</a> · <a href="/privacy">Privacy</a><br>© 2026 M2W Technologies Private Limited · <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a></footer>
</main></body></html>`;
}

function status(c: Centre, now: Date): string {
  if (!c.plan || !c.expires_at) return '<p class="status">No plan yet.</p>';
  const active = c.status === 'active' && c.expires_at.getTime() > now.getTime();
  const until = day(c.expires_at);
  if (!active)
    return `<p class="status ended">Your ${c.plan === 'trial' ? 'free trial' : 'plan'} ended on ${until}. Choose a plan to keep adding students, attendance and fees. Nothing you saved is lost.</p>`;
  if (c.plan === 'trial') return `<p class="status">Your free trial runs until ${until}.</p>`;
  const name = PLANS[c.plan as Plan['id']]?.name ?? c.plan;
  return `<p class="status">${esc(name)} plan, active until ${until}. Paying now adds the new months after that date.</p>`;
}

function plansHtml(token: string, canPay: boolean): string {
  const best = Math.min(...Object.values(PLANS).map((p) => p.pricePaise / p.months));
  return `<div class="plans">${Object.values(PLANS)
    .map((p) => {
      const perMonth = Math.round(p.pricePaise / p.months / 100);
      return `<section class="plan${p.pricePaise / p.months === best ? ' best' : ''}">
${p.pricePaise / p.months === best ? '<span class="tag">Best value</span>' : ''}<h2>${esc(p.name)}</h2>
<p class="price">${rupees(p.pricePaise)} <span>for ${p.months} months</span></p>
<p class="per">About ₹${perMonth} a month</p>
<ul><li>${limit(p.studentLimit, 'students')}</li><li>${limit(p.batchLimit, 'batches')}</li><li>Attendance, fees, reports and WhatsApp updates to parents</li></ul>
${
  canPay
    ? `<form method="post" action="/pay/${esc(token)}"><input type="hidden" name="plan" value="${p.id}"><button type="submit">Pay ${rupees(p.pricePaise)}</button></form>`
    : ''
}</section>`;
    })
    .join('')}</div>`;
}

/**
 * The page a centre pays for its plan on, outside the store apps: tutor.chalkpis.com/pay/<token>, sent to the tutor
 * on WhatsApp. It shows the centre's plan and the three plans; paying opens the provider's hosted page, and the plan
 * switches on only once the provider confirms (see billing.ts). Plain HTML, no scripts, nothing stored in the browser.
 */
export function payRoutes(app: FastifyInstance, deps: Deps) {
  const css = readFileSync(path.join(PUBLIC_DIR, 'pay.css'), 'utf8');
  const now = () => (deps.clock ?? (() => new Date()))();
  const send = (reply: FastifyReply, code: number, html: string) =>
    reply
      .code(code)
      .header('Content-Security-Policy', PAY_CSP)
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(html);

  const load = async (token: string): Promise<{ id: string; c: Centre } | null> => {
    const id = parsePayToken(deps.config.JWT_SECRET, token);
    if (!id) return null;
    const [rows] = (await deps.pool.query(
      `SELECT i.name, i.owner_user_id, u.phone, s.plan, s.status, s.expires_at
         FROM institutes i JOIN users u ON u.id = i.owner_user_id
         LEFT JOIN subscriptions s ON s.institute_id = i.id
        WHERE i.id = ?`,
      [id],
    )) as unknown as [Centre[]];
    return rows[0] ? { id, c: rows[0] } : null;
  };
  const notFound = (reply: FastifyReply) =>
    send(
      reply,
      404,
      page(
        'Link not found',
        '<h1>This payment link does not work</h1><p>Ask Chalkpis for a new link on WhatsApp, or write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a>.</p>',
      ),
    );
  const view = (token: string, c: Centre, note = '') =>
    page(
      `Plans for ${c.name}`,
      `<h1>Choose a plan</h1><p class="centre">${esc(c.name)}</p>${status(c, now())}${note}${
        deps.billing
          ? ''
          : '<p class="note">Online payment is not switched on yet. Write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a> and we will help you renew.</p>'
      }${plansHtml(token, !!deps.billing)}<p class="small">One payment, no auto-renewal. Pay by UPI, card or net banking.</p>`,
      undefined,
      deps.billing?.name,
    );

  app.get('/pay.css', async (_req, reply) =>
    reply.header('Cache-Control', 'public, max-age=3600').type('text/css; charset=utf-8').send(css),
  );

  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 1024 },
      (_req, body, done) => done(null, body),
    );

    scope.get<{ Params: { token: string } }>('/pay/:token', async (req, reply) => {
      const found = await load(req.params.token);
      if (!found) return notFound(reply);
      return send(reply, 200, view(req.params.token, found.c));
    });

    scope.post<{ Params: { token: string } }>(
      '/pay/:token',
      { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const found = await load(req.params.token);
        if (!found) return notFound(reply);
        const planId = new URLSearchParams(typeof req.body === 'string' ? req.body : '').get(
          'plan',
        );
        if (!deps.billing || !isPlanId(planId))
          return send(reply, 400, view(req.params.token, found.c));
        try {
          const order = await createOrder(deps.pool, deps.billing, {
            instituteId: found.id,
            userId: found.c.owner_user_id,
            planId,
            ownerPhone: found.c.phone ?? undefined,
            ...orderUrls(deps.config, deps.billing),
          });
          if (!/^https:\/\//.test(order.url)) throw new Error('not-https');
          const plan = PLANS[planId];
          return send(
            reply,
            200,
            page(
              'Opening payment',
              `<h1>Opening the payment page…</h1><p>${esc(plan.name)} plan for ${esc(found.c.name)}: ${rupees(plan.pricePaise)} for ${plan.months} months.</p><p><a class="button" href="${esc(order.url)}">Continue to payment</a></p>`,
              order.url,
              deps.billing.name,
            ),
          );
        } catch (e) {
          const cause = (e as { cause?: unknown }).cause;
          req.log.warn(
            { err: e, reason: cause instanceof Error ? cause.message : undefined },
            'pay page: payment link failed',
          );
          return send(
            reply,
            502,
            view(
              req.params.token,
              found.c,
              '<p class="note error">We could not open the payment page just now. Please try again in a minute, or write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a>.</p>',
            ),
          );
        }
      },
    );
  });
}
