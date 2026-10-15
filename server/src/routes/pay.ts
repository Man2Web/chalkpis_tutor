import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app.js';
import { requestOtp, verifyOtp } from '../auth/otp.js';
import { parsePayToken } from '../billing/payLink.js';
import {
  clearPlanSessionCookie,
  planSessionCookie,
  readPlanSession,
} from '../billing/planSession.js';
import {
  PLANS,
  PLAN_RANK,
  POPULAR,
  isCycle,
  isPlanId,
  monthsOf,
  planChange,
  type Cycle,
  type Plan,
} from '../billing/plans.js';
import type { BillingProvider } from '../billing/provider.js';
import { billingHistory, createOrder, reconcilePending, storeRenews } from '../billing/service.js';
import { autoRenewFor, startWebSubscription, stopAutoRenew } from '../billing/webSubscriptions.js';
import { AppError } from '../errors.js';
import { CATEGORIES, type Category } from '../institutes/category.js';
import { activeCount } from '../institutes/limits.js';
import { createInstitute } from '../institutes/service.js';
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
  store: 'app_store' | 'play_store' | null;
  store_will_renew: number | null;
  /** 1 while the free trial waits for the owner's first sign-in in the app (an iPhone owner who signed up here) */
  trial_waits: number;
  /** null until the owner first signs in in the app */
  first_app_at: Date | null;
  /** the phone chosen when signing up on the website (null: set up in the app) */
  signup_phone: 'android' | 'ios' | null;
}
const CENTRE_SQL = `SELECT i.id, i.name, i.owner_user_id, COALESCE(u.phone, NULLIF(i.phone, '')) AS phone, s.plan, s.status, s.expires_at, s.student_limit,
       s.batch_limit, s.store, s.store_will_renew, (s.plan = 'trial' AND i.trial_on_first_app_use = 1) AS trial_waits,
       i.first_app_sign_in_at AS first_app_at, i.signup_phone
  FROM institutes i JOIN users u ON u.id = i.owner_user_id
  LEFT JOIN subscriptions s ON s.institute_id = i.id`;

// receipts name the gateway each payment went through (PhonePe and Cashfree were used before Razorpay)
const GATEWAY: Record<string, string> = {
  cashfree: 'Cashfree Payments',
  phonepe: 'PhonePe',
  razorpay: 'Razorpay',
  apple: 'App Store',
  google: 'Google Play',
};
const STORE_NAME = { app_store: 'the App Store', play_store: 'Google Play' } as const;
const cycleText = (cycle: Cycle | null, plan: Plan['id']) =>
  cycle === 'year' ? '1 year' : cycle === 'month' ? '1 month' : `${monthsOf(plan, null)} months`;

const PLAY_URL = 'https://play.google.com/store/apps/details?id=in.chalkpis.tutors';
/**
 * Where someone who signed up from chalkpis.com (/start) lands: a page there counts the sign-up (Google Analytics, the
 * Meta Pixel) and shows the app links. These pages run no scripts, so they could not count it themselves.
 */
const WELCOME_URL = 'https://chalkpis.com/welcome';

const CATEGORY_LABEL: Record<Category, string> = {
  tuition: 'Tuition',
  coaching: 'Coaching',
  abacus: 'Abacus',
  karate: 'Karate or martial arts',
  dance: 'Dance or music',
  yoga: 'Yoga or fitness',
  sports: 'Sports',
  other: 'Something else',
};

/** Which page the sign-in steps return to, and the ad campaign (utm_* only) they keep along the way. */
interface Flow {
  next: 'start' | 'plan';
  src: string;
}
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const cleanSrc = (raw: string | null | undefined) => {
  const q = new URLSearchParams(raw ?? '');
  const out = new URLSearchParams();
  for (const k of UTM_KEYS) {
    const v = q.get(k)?.trim();
    if (v) out.set(k, v.slice(0, 80));
  }
  return out.toString().slice(0, 400);
};
const flowOf = (f: URLSearchParams): Flow => ({
  next: f.get('next') === 'start' ? 'start' : 'plan',
  src: cleanSrc(f.get('src')),
});
const flowFields = (flow: Flow) =>
  `<input type="hidden" name="next" value="${flow.next}"><input type="hidden" name="src" value="${esc(flow.src)}">`;
const flowQuery = (flow: Flow) =>
  new URLSearchParams({ next: flow.next, src: flow.src }).toString();

/**
 * "Use Chalkpis on your phone": the Google Play link, and the iPhone app still to come. An owner who chose iPhone when
 * signing up sees the iPhone part first.
 */
function appBox(
  c: { phone: string | null; trial_waits?: number; signup_phone?: 'android' | 'ios' | null },
  heading = 'Use Chalkpis on your phone',
): string {
  const number = c.phone ? `<strong>${esc(maskPhone(c.phone))}</strong>` : 'this WhatsApp number';
  const play = `${PLAY_URL}&amp;referrer=utm_source%3Dtutor.chalkpis.com%26utm_medium%3Dwebsite%26utm_campaign%3Dsignup`;
  const waits = Number(c.trial_waits) ? ', and your free trial starts when you first open it' : '';
  if (c.signup_phone === 'ios')
    return `<section class="app"><h2>${esc(heading)}</h2><p>The Chalkpis iPhone app is coming soon to the App Store. We will send you a WhatsApp message on ${number} when it is ready${waits}.</p><p class="small">Have an Android phone too? <a href="${play}">Get the app on Google Play</a> and sign in with the same number.</p></section>`;
  return `<section class="app"><h2>${esc(heading)}</h2><p>Install the app and sign in with ${number}. Everything you set up here is already there.</p><a class="button" href="${play}">Get it on Google Play</a><p class="small"><strong>iPhone:</strong> the Chalkpis app is coming soon to the App Store. We will send you a WhatsApp message when it is ready${waits}.</p></section>`;
}

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

type AutoRenew = Awaited<ReturnType<typeof autoRenewFor>>;
const cycleWord = (c: Cycle | null | undefined) => (c === 'month' ? 'monthly' : 'yearly');

function status(c: Centre, now: Date, auto: AutoRenew = null): string {
  if (!c.plan || !c.expires_at) return '<p class="status">No plan yet.</p>';
  if (Number(c.trial_waits))
    return '<p class="status">Your free trial starts when you first open the Chalkpis app on your phone.</p>';
  const active = c.status === 'active' && c.expires_at.getTime() > now.getTime();
  const until = day(c.expires_at);
  if (auto?.via === 'website') {
    const next = auto.nextChargeAt ? day(new Date(auto.nextChargeAt)) : until;
    const what = `${esc(planName(auto.plan))} plan (${cycleWord(auto.cycle)})`;
    return auto.status === 'pending'
      ? `<p class="status ended">${what}: the last automatic payment did not go through. Razorpay is trying again; make sure your UPI app or card allows it, or turn auto-renew off and choose a plan.</p>`
      : `<p class="status">${what}, auto-renew is on. ${active ? `Paid until ${until}. ` : ''}Next payment ${rupees(auto.amountPaise ?? 0)} on ${next} by UPI Autopay or card.</p>`;
  }
  if (active && c.store)
    return storeRenews(c)
      ? `<p class="status">${esc(planName(c.plan))} plan, renewing automatically through ${STORE_NAME[c.store]} on ${until}. You can change or cancel it in the Chalkpis app.</p>`
      : `<p class="status">${esc(planName(c.plan))} plan through ${STORE_NAME[c.store]}, ending on ${until} (it will not renew). You can pay for the time after that here.</p>`;
  if (!active)
    return `<p class="status ended">Your ${c.plan === 'trial' ? 'free trial' : 'plan'} ended on ${until}. Choose a plan to keep adding students, attendance and fees. Nothing you saved is lost.</p>`;
  if (c.plan === 'trial') return `<p class="status">Your free trial runs until ${until}.</p>`;
  return `<p class="status">${esc(planName(c.plan))} plan, active until ${until}. Renewing adds months after that date; upgrading starts now and credits the days you have left.</p>`;
}

/**
 * The three plan cards. With auto-renew available (Razorpay Subscriptions), each plan starts as a subscription: yearly
 * (the main button) or monthly, plus a small "pay once for 1 year" link; with auto-renew already on, the same plan
 * says so, a higher one is an upgrade (charged now) and a lower one waits for the renewal. Without it (or for a
 * one-time year), the buttons pay once. Each button posts plan, cycle and mode (plus any hidden fields) to `action`.
 * No scripts, so every choice is a plain form.
 */
function plansHtml(
  action: string | null,
  hidden: Record<string, string> = {},
  c?: Centre,
  now: Date = new Date(),
  opts: { subscribe?: boolean; auto?: AutoRenew } = {},
): string {
  const fields = Object.entries(hidden)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  const form = (p: Plan, cycle: Cycle, mode: 'subscribe' | 'once', label: string, cls = '') =>
    `<form method="post" action="${esc(action ?? '')}">${fields}<input type="hidden" name="plan" value="${p.id}"><input type="hidden" name="cycle" value="${cycle}"><input type="hidden" name="mode" value="${mode}"><button type="submit"${cls ? ` class="${cls}"` : ''}>${label}</button></form>`;
  const auto = opts.auto?.via === 'website' ? opts.auto : null;
  return `<div class="plans">${Object.values(PLANS)
    .map((p) => {
      const popular = p.id === POPULAR;
      const perDay = Math.round(p.prices.year / 365 / 100);
      const yearly = rupees(p.prices.year);
      const monthly = rupees(p.prices.month);
      return `<section class="plan${popular ? ' best' : ''}">
${popular ? '<span class="tag">Most popular</span>' : ''}<h2>${esc(p.name)}</h2>
<p class="price">${yearly} <span>a year</span></p>
<p class="per">Just ₹${perDay} a day · or ${monthly} a month</p>
<ul><li>${limit(p.studentLimit, 'students')}</li><li>${limit(p.batchLimit, 'batches')}</li><li>Attendance, fees, reports and WhatsApp updates to parents</li></ul>
${(() => {
  if (!action) return '';
  if (opts.subscribe && auto) {
    if (p.id === auto.plan) {
      const other: Cycle = auto.cycle === 'month' ? 'year' : 'month';
      return `<p class="note">Your plan: auto-renews ${cycleWord(auto.cycle)}.</p>${form(p, other, 'subscribe', `Switch to ${cycleWord(other)} · ${rupees(p.prices[other])}/${other}`, 'secondary')}`;
    }
    if (PLAN_RANK[p.id] < (PLAN_RANK[auto.plan as Plan['id']] ?? 0))
      return '<p class="note">To move to this plan, turn auto-renew off; then choose it once your plan ends.</p>';
    return (
      form(p, 'year', 'subscribe', `Upgrade · ${yearly}/year`) +
      form(p, 'month', 'subscribe', `Upgrade · ${monthly}/month`, 'secondary')
    );
  }
  const change = c
    ? planChange(
        {
          plan: c.plan ?? undefined,
          status: c.status ?? undefined,
          expiresAt: c.expires_at ?? undefined,
        },
        p.id,
        now,
      )
    : ({ ok: true, kind: 'new' } as const);
  if (!change.ok)
    return `<p class="note">Available after your current plan ends on ${day(change.until)}.</p>`;
  if (opts.subscribe) {
    const verb = change.kind === 'upgrade' ? 'Upgrade' : 'Start';
    return (
      form(p, 'year', 'subscribe', `${verb} yearly · ${yearly}/year`) +
      form(p, 'month', 'subscribe', `${verb} monthly · ${monthly}/month`, 'secondary') +
      form(p, 'year', 'once', 'or pay once for 1 year (no auto-renew)', 'link once')
    );
  }
  const verb = change.kind === 'renew' ? 'Renew' : change.kind === 'upgrade' ? 'Upgrade' : 'Pay';
  return (
    form(p, 'year', 'once', `${verb} ${yearly} for a year`) +
    form(p, 'month', 'once', `${verb} ${monthly} for a month`, 'secondary')
  );
})()}</section>`;
    })
    .join('')}</div>`;
}

const PAYMENTS_OFF =
  '<p class="note">Online payment is not switched on yet. Write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a> and we will help you renew.</p>';
const STORE_MANAGED =
  '<p class="note">This plan renews automatically in the Chalkpis app, so there is nothing to pay here. To change it, open Plans &amp; billing in the app.</p>';
const AUTO_RENEW_NOTE =
  '<p class="small">Plans renew automatically until you turn auto-renew off (here, or in your UPI app). The first payment is taken when your free trial or current plan ends, then every month or year, by UPI Autopay or card. You are told before each payment.</p>';
const ONCE_NOTE =
  '<p class="small">One payment, no auto-renewal. Pay by UPI, card or net banking.</p>';
const SUBSCRIBE_REFUSED: Record<string, string> = {
  already_renewing: 'This plan already renews automatically.',
  downgrade_at_renewal:
    'A lower plan starts at renewal: turn auto-renew off first, then choose it once your plan ends.',
  auto_renew_on:
    'Auto-renew is on, so there is nothing to pay now. Turn it off first to pay once instead.',
};
const PAY_FAILED =
  '<p class="note error">We could not open the payment page just now. Please try again in a minute, or write to <a href="mailto:hello@chalkpis.com">hello@chalkpis.com</a>.</p>';

/**
 * Where centres pay for their plan on the web (inside the iPhone and Android apps they subscribe through the store
 * instead; a centre whose store subscription renews by itself is not sold anything here):
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
    cycle: Cycle,
  ): Promise<string | null> => {
    if (storeRenews(c)) return STORE_MANAGED;
    try {
      const order = await createOrder(deps.pool, deps.billing!, {
        instituteId: c.id,
        userId: c.owner_user_id,
        planId,
        cycle,
        ownerPhone: c.phone ?? undefined,
        ...orderUrls(deps.config),
        now: now(),
      });
      if (!/^https:\/\//.test(order.url)) throw new Error('not-https');
      const plan = PLANS[planId];
      await send(
        reply,
        200,
        page(
          'Opening payment',
          `<h1>Opening the payment page…</h1><p>${esc(plan.name)} plan for ${esc(c.name)}: ${rupees(order.amountPaise)} for ${cycle === 'year' ? 'a year' : 'a month'}.</p><p><a class="button" href="${esc(order.url)}">Continue to payment</a></p>`,
          { refresh: order.url, gateway },
        ),
      );
      return null;
    } catch (e) {
      const code = e instanceof AppError ? e.code : '';
      if (SUBSCRIBE_REFUSED[code]) return `<p class="note">${SUBSCRIBE_REFUSED[code]}</p>`;
      const cause = (e as { cause?: unknown }).cause;
      req.log.warn(
        { err: e, reason: cause instanceof Error ? cause.message : undefined },
        'pay page: payment link failed',
      );
      return PAY_FAILED;
    }
  };

  const canSubscribe = !!deps.billing?.createSubscription;

  /**
   * Starts auto-renew and sends the owner to Razorpay to approve UPI Autopay or a card mandate; an error comes back as
   * a note. The first payment is when the trial or current plan ends (an upgrade: now).
   */
  const startSubscription = async (
    req: FastifyRequest,
    reply: FastifyReply,
    c: Centre,
    planId: Plan['id'],
    cycle: Cycle,
  ): Promise<string | null> => {
    if (storeRenews(c)) return STORE_MANAGED;
    try {
      const r = await startWebSubscription(deps.pool, deps.billing!, {
        instituteId: c.id,
        userId: c.owner_user_id,
        planId,
        cycle,
        now: now(),
      });
      if (!/^https:\/\//.test(r.url)) throw new Error('not-https');
      const first = r.startAt
        ? `The first payment of ${rupees(r.amountPaise)} is on ${day(r.startAt)}, when your ${c.plan === 'trial' ? 'free trial' : 'current plan'} ends`
        : `The first payment of ${rupees(r.amountPaise)} is taken now`;
      await send(
        reply,
        200,
        page(
          'Turning on auto-renew',
          `<h1>Turning on auto-renew…</h1><p>${esc(PLANS[planId].name)} plan (${cycleWord(cycle)}) for ${esc(c.name)}. ${first}, then every ${cycle}.</p><p>On the next page, approve UPI Autopay in your UPI app, or use a card. You can turn auto-renew off at any time. Come back to this page afterwards to see it on.</p><p><a class="button" href="${esc(r.url)}">Continue</a></p>`,
          { refresh: r.url, gateway },
        ),
      );
      return null;
    } catch (e) {
      const code = e instanceof AppError ? e.code : '';
      if (code === 'store_managed') return STORE_MANAGED;
      if (SUBSCRIBE_REFUSED[code]) return `<p class="note">${SUBSCRIBE_REFUSED[code]}</p>`;
      const cause = (e as { cause?: unknown }).cause;
      req.log.warn(
        { err: e, reason: cause instanceof Error ? cause.message : undefined },
        'pay page: subscription failed',
      );
      return PAY_FAILED;
    }
  };

  /** A plan button's form: auto-renew or pay once (a month is only sold as auto-renew when that is available). */
  const choice = (f: URLSearchParams) => {
    const planId = f.get('plan');
    const cycle = f.get('cycle') ?? 'year';
    const mode = f.get('mode') === 'subscribe' && canSubscribe ? 'subscribe' : 'once';
    if (!isPlanId(planId) || !isCycle(cycle)) return null;
    if (mode === 'once' && cycle === 'month' && canSubscribe) return null;
    return { planId, cycle, mode } as const;
  };
  const go = (
    req: FastifyRequest,
    reply: FastifyReply,
    c: Centre,
    x: { planId: Plan['id']; cycle: Cycle; mode: 'subscribe' | 'once' },
  ) =>
    x.mode === 'subscribe'
      ? startSubscription(req, reply, c, x.planId, x.cycle)
      : startPayment(req, reply, c, x.planId, x.cycle);

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
    const tokenView = async (token: string, c: Centre, note = '') => {
      const auto = await autoRenewFor(deps.pool, c.id);
      return page(
        `Plans for ${c.name}`,
        `<h1>Choose a plan</h1><p class="centre">${esc(c.name)}</p>${status(c, now(), auto)}${note}${
          deps.billing ? '' : PAYMENTS_OFF
        }${plansHtml(deps.billing && !storeRenews(c) ? `/pay/${token}` : null, {}, c, now(), { subscribe: canSubscribe, auto })}${canSubscribe ? AUTO_RENEW_NOTE : ONCE_NOTE}<p class="small"><a href="/plan">Sign in</a> to see past payments and receipts${auto?.via === 'website' ? ', or to turn auto-renew off' : ''}.</p>`,
        { gateway },
      );
    };

    scope.get<{ Params: { token: string } }>('/pay/:token', async (req, reply) => {
      let c = await byToken(req.params.token);
      if (!c) return tokenNotFound(reply);
      if (
        await reconcilePending(
          deps.pool,
          deps.billing,
          { instituteId: c.id, sinceMinutes: 24 * 60 },
          now(),
        )
      )
        c = (await byToken(req.params.token))!;
      return send(reply, 200, await tokenView(req.params.token, c));
    });

    scope.post<{ Params: { token: string } }>(
      '/pay/:token',
      { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const c = await byToken(req.params.token);
        if (!c) return tokenNotFound(reply);
        const x = choice(formBody(req.body));
        if (!deps.billing || !x) return send(reply, 400, await tokenView(req.params.token, c));
        const failed = await go(req, reply, c, x);
        if (failed) return send(reply, 502, await tokenView(req.params.token, c, failed));
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

    const signInPage = (note = '', phone = '', flow: Flow = { next: 'plan', src: '' }) =>
      page(
        flow.next === 'start' ? 'Start your free trial' : 'Your plan',
        `${
          flow.next === 'start'
            ? `<h1>Start your free trial</h1><p>Create your Chalkpis account with your WhatsApp number. It is free for ${deps.config.TRIAL_DAYS} days, no card needed. Already have an account? This signs you in.</p>`
            : '<h1>Your Chalkpis plan</h1><p>Sign in with your WhatsApp number to see your plan and pay. New to Chalkpis? Enter your number and we will set up your account.</p>'
        }${note}<form class="signin" method="post" action="/plan/code">${flowFields(flow)}<label for="phone">WhatsApp number</label><input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="16" required value="${esc(phone)}" placeholder="98765 43210"><button type="submit">Send code on WhatsApp</button></form>`,
      );
    const codePage = (phone: string, note = '', flow: Flow = { next: 'plan', src: '' }) =>
      page(
        'Enter the code',
        `<h1>Enter the code</h1><p>We sent a 6-digit code on WhatsApp to ${esc(maskPhone(phone))}.</p>${note}<form class="signin" method="post" action="/plan/verify">${flowFields(flow)}<input type="hidden" name="phone" value="${esc(phone)}"><label for="code">Code</label><input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus><button type="submit">Continue</button></form><p class="small"><a href="${flow.next === 'start' ? '/start' : '/plan'}">Use another number</a></p>`,
      );
    const setupPage = (flow: Flow, note = '', v: Record<string, string> = {}) =>
      page(
        'Set up your centre',
        `<h1>Set up your centre</h1><p>A few details and you are in. You can change them later in the app.</p>${note}<form class="signin" method="post" action="/plan/setup">${flowFields(flow)}
<label for="tutorName">Your name</label><input id="tutorName" name="tutorName" autocomplete="name" minlength="2" maxlength="80" required value="${esc(v.tutorName ?? '')}" placeholder="Your name">
<label for="instituteName">Name of your class or centre</label><input id="instituteName" name="instituteName" minlength="2" maxlength="120" required value="${esc(v.instituteName ?? '')}" placeholder="Vidya Tuition Centre">
<label for="category">What do you teach?</label><select id="category" name="category">${CATEGORIES.map(
          (k) =>
            `<option value="${k}"${(v.category ?? 'tuition') === k ? ' selected' : ''}>${CATEGORY_LABEL[k]}</option>`,
        ).join('')}</select>
<fieldset class="choice"><legend>Which phone will you use Chalkpis on?</legend><label><input type="radio" name="phone" value="android" required${v.phone === 'android' ? ' checked' : ''}> Android</label><label><input type="radio" name="phone" value="ios"${v.phone === 'ios' ? ' checked' : ''}> iPhone</label></fieldset>
<p class="small">The iPhone app is coming soon. If you choose iPhone, your ${deps.config.TRIAL_DAYS}-day free trial starts when you first open the app, not today.</p>
<button type="submit">Create my account</button></form>`,
      );
    const signOutNav =
      '<form class="nav" method="post" action="/plan/logout"><button type="submit" class="link">Sign out</button></form>';

    const accountPage = async (
      centres: Centre[],
      selected: Centre,
      note = '',
      opts: { welcome?: boolean } = {},
    ) => {
      const c = selected;
      const [students, batches, history, auto] = await Promise.all([
        activeCount(deps.pool, 'students', c.id),
        activeCount(deps.pool, 'batches', c.id),
        billingHistory(deps.pool, c.id),
        autoRenewFor(deps.pool, c.id),
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
        `<h1>${esc(c.name)}</h1>${switcher}${opts.welcome ? '<p class="status">Your account is ready. Choose a plan now, or start with the free trial.</p>' : ''}${status(c, now(), auto)}${note}
${opts.welcome || !c.first_app_at ? appBox(c, opts.welcome ? 'Next: get the app' : 'Use Chalkpis on your phone') : ''}
<section class="usage">${meter('Students', students, c.student_limit)}${meter('Batches', batches, c.batch_limit)}</section>
${
  auto?.via === 'website'
    ? `<form class="nav" method="post" action="/plan/autorenew/off"><input type="hidden" name="centre" value="${c.id}"><button type="submit" class="link">Turn off auto-renew</button></form>`
    : ''
}
<h2 class="section">${auto?.via === 'website' ? 'Change plan' : 'Choose a plan'}</h2>${deps.billing ? '' : PAYMENTS_OFF}${plansHtml(deps.billing && !storeRenews(c) ? '/plan/pay' : null, { centre: c.id }, c, now(), { subscribe: canSubscribe, auto })}
${canSubscribe ? AUTO_RENEW_NOTE : ONCE_NOTE}
<h2 class="section">Payments</h2>${rows}`,
        { gateway, nav: signOutNav },
      );
    };
    const pick = (centres: Centre[], id: string | null) =>
      centres.find((x) => x.id === id) ?? centres[0];
    const noCentre = page(
      'No centre',
      '<h1>This number is a helper</h1><p>It is a helper at a centre on Chalkpis. Only the centre&#39;s owner can see and pay for its plan, so sign in with the owner&#39;s number. To set up a centre of your own, use a different WhatsApp number.</p><p><a class="button" href="/plan">Use another number</a></p>',
      { nav: signOutNav },
    );

    /** Signed in but no centre of their own: a helper, or a new owner who still has to set one up. */
    const isMember = async (userId: string) =>
      (
        (await deps.pool.query('SELECT 1 FROM memberships WHERE user_id = ? LIMIT 1', [
          userId,
        ])) as unknown as [unknown[]]
      )[0].length > 0;

    scope.get<{ Querystring: { centre?: string; welcome?: string } }>(
      '/plan',
      async (req, reply) => {
        const userId = await signedIn(req);
        if (!userId) return send(reply, 200, signInPage());
        let centres = await ownedCentres(userId);
        // a payment made here but never confirmed back (browser closed, webhook missed) switches the plan on now
        let found = 0;
        for (const c of centres)
          found += await reconcilePending(
            deps.pool,
            deps.billing,
            { instituteId: c.id, sinceMinutes: 24 * 60 },
            now(),
          );
        if (found) centres = await ownedCentres(userId);
        if (!centres.length)
          return (await isMember(userId))
            ? send(reply, 200, noCentre)
            : reply.redirect('/plan/setup', 303);
        return send(
          reply,
          200,
          await accountPage(centres, pick(centres, req.query.centre ?? null)!, '', {
            welcome: req.query.welcome === '1',
          }),
        );
      },
    );

    // Sign-up from chalkpis.com: the same steps as /plan, then on to chalkpis.com/welcome (decision 147)
    scope.get<{ Querystring: Record<string, string> }>('/start', async (req, reply) => {
      const flow: Flow = {
        next: 'start',
        src: cleanSrc(new URLSearchParams(req.query).toString()),
      };
      const userId = await signedIn(req);
      if (userId) {
        if ((await ownedCentres(userId)).length) return reply.redirect('/plan', 303);
        if (!(await isMember(userId))) return reply.redirect(`/plan/setup?${flowQuery(flow)}`, 303);
      }
      return send(reply, 200, signInPage('', '', flow));
    });

    scope.post(
      '/plan/code',
      { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const f = formBody(req.body);
        const flow = flowOf(f);
        const raw = f.get('phone') ?? '';
        const phone = normalizeIndianPhone(raw);
        if (!phone)
          return send(
            reply,
            400,
            signInPage(
              '<p class="note error">Enter a 10-digit Indian mobile number.</p>',
              raw.slice(0, 16),
              flow,
            ),
          );
        // Any number gets a code: a new one is signing up, the same as in the app (which has the same limits).
        const r = await requestOtp(otpDeps, phone);
        if (r.ok || r.error === 'too_soon') return send(reply, 200, codePage(phone, '', flow)); // the last code still works
        const why =
          r.error === 'too_many'
            ? 'Too many codes for this number. Please try again in an hour.'
            : 'We could not send a code just now. Please try again in a few minutes.';
        return send(
          reply,
          r.error === 'too_many' ? 429 : 503,
          signInPage(`<p class="note error">${why}</p>`, raw.slice(0, 16), flow),
        );
      },
    );

    scope.post(
      '/plan/verify',
      { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const f = formBody(req.body);
        const flow = flowOf(f);
        const phone = normalizeIndianPhone(f.get('phone') ?? '');
        if (!phone) return reply.redirect(flow.next === 'start' ? '/start' : '/plan', 303);
        // a new number gets its account here, as in the app
        const r = await verifyOtp(otpDeps, phone, (f.get('code') ?? '').trim());
        if (!r.ok)
          return send(
            reply,
            401,
            codePage(
              phone,
              '<p class="note error">That code is not right or has expired. Check WhatsApp and try again.</p>',
              flow,
            ),
          );
        const owner = (await ownedCentres(r.userId)).length > 0;
        const to = owner || (await isMember(r.userId)) ? '/plan' : `/plan/setup?${flowQuery(flow)}`;
        return reply
          .header(
            'Set-Cookie',
            planSessionCookie(deps.config.JWT_SECRET, r.userId, now().getTime(), secure),
          )
          .redirect(to, 303);
      },
    );

    scope.get<{ Querystring: Record<string, string> }>('/plan/setup', async (req, reply) => {
      const flow = flowOf(new URLSearchParams(req.query));
      const userId = await signedIn(req);
      if (!userId) return reply.redirect(flow.next === 'start' ? '/start' : '/plan', 303);
      if ((await ownedCentres(userId)).length || (await isMember(userId)))
        return reply.redirect('/plan', 303);
      return send(reply, 200, setupPage(flow));
    });

    scope.post(
      '/plan/setup',
      { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const f = formBody(req.body);
        const flow = flowOf(f);
        const userId = await signedIn(req);
        if (!userId || !sameOrigin(req))
          return reply.redirect(flow.next === 'start' ? '/start' : '/plan', 303);
        const v = {
          tutorName: (f.get('tutorName') ?? '').trim().slice(0, 80),
          instituteName: (f.get('instituteName') ?? '').trim().slice(0, 120),
          category: f.get('category') ?? '',
          phone: f.get('phone') ?? '',
        };
        const category = (CATEGORIES as readonly string[]).includes(v.category)
          ? (v.category as Category)
          : null;
        const os = v.phone === 'android' || v.phone === 'ios' ? v.phone : null;
        if (v.tutorName.length < 2 || v.instituteName.length < 2 || !category || !os)
          return send(
            reply,
            400,
            setupPage(
              flow,
              '<p class="note error">Please fill in your name, your centre&#39;s name and the phone you will use.</p>',
              v,
            ),
          );
        const r = await createInstitute(
          deps.pool,
          userId,
          { tutorName: v.tutorName, instituteName: v.instituteName, category, language: 'en' },
          now(),
          deps.config.TRIAL_DAYS,
          { phone: os, source: flow.src, trialOnFirstAppUse: os === 'ios' },
        );
        if (!r.created) return reply.redirect('/plan', 303);
        return reply.redirect(
          flow.next === 'start' ? `${WELCOME_URL}?os=${os}` : '/plan?welcome=1',
          303,
        );
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
        const x = choice(f);
        if (!c || !deps.billing || !x) return reply.redirect('/plan', 303);
        const failed = await go(req, reply, c, x);
        if (failed) return send(reply, 502, await accountPage(centres, c, failed));
        return reply;
      },
    );

    // The owner turns auto-renew off: the plan runs to its paid end and is not charged again.
    scope.post(
      '/plan/autorenew/off',
      { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const userId = await signedIn(req);
        if (!userId || !sameOrigin(req)) return reply.redirect('/plan', 303);
        const centres = await ownedCentres(userId);
        const c = centres.find((x) => x.id === formBody(req.body).get('centre'));
        if (!c || !deps.billing) return reply.redirect('/plan', 303);
        let note: string;
        try {
          note = (await stopAutoRenew(deps.pool, deps.billing, c.id, null))
            ? `<p class="status">Auto-renew is off. ${c.expires_at && c.expires_at > now() ? `Your plan runs until ${day(c.expires_at)} and` : 'Your plan'} is not charged again. You can turn it back on by choosing a plan.</p>`
            : '<p class="note">Auto-renew was already off.</p>';
        } catch (e) {
          req.log.warn({ err: e }, 'pay page: stop auto-renew failed');
          note = PAY_FAILED;
        }
        return send(reply, 200, await accountPage(await ownedCentres(userId), c, note));
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
        return send(
          reply,
          200,
          page(
            'Payment receipt',
            `<article class="receipt"><h1>Payment receipt</h1>
<dl><dt>Received from</dt><dd>${esc(c.name)}${c.phone ? `<br>${esc(maskPhone(c.phone))}` : ''}</dd>
<dt>For</dt><dd>Chalkpis ${esc(planName(h.planId))} plan${isPlanId(h.planId) ? ` (${cycleText(h.cycle, h.planId)})` : ''}</dd>
<dt>Valid until</dt><dd>${day(new Date(h.expiresAt))}</dd>
<dt>Amount paid</dt><dd><strong>${h.currency === 'INR' ? rupees(h.amountPaise) : `${esc(h.currency)} ${(h.amountPaise / 100).toFixed(2)}`}</strong>${h.refunded ? ' (refunded)' : ''}</dd>
<dt>Paid on</dt><dd>${day(new Date(h.paidAt))}</dd>
<dt>Payment ID</dt><dd class="mono">${esc(h.paymentId)}</dd>
<dt>Paid through</dt><dd>${esc(GATEWAY[h.provider] ?? h.provider)}</dd></dl>
<p class="small">${h.provider === 'apple' || h.provider === 'google' ? `This payment was taken by ${GATEWAY[h.provider]}, which also sends its own receipt. ` : ''}Issued by M2W Technologies Private Limited, the company behind Chalkpis · hello@chalkpis.com. To save a copy, use your browser's Print or Share.</p>
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
