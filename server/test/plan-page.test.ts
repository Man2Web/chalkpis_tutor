import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readPlanSession } from '../src/billing/planSession.js';
import { PLANS } from '../src/billing/plans.js';
import { queuePlanReminders } from '../src/messaging/centreMessages.js';
import type { BillingProvider, LinkRequest, OrderStatus } from '../src/billing/provider.js';
import { startHarness, type Harness } from './helpers.js';

const SECRET = 'test-jwt-secret-test-jwt-secret-1234';

class FakeGateway implements BillingProvider {
  name = 'razorpay' as const;
  created: LinkRequest[] = [];
  async createPaymentLink(req: LinkRequest) {
    this.created.push(req);
    return {
      id: req.referenceId,
      url: `https://rzp.io/i/${req.referenceId}`,
    };
  }
  async checkStatus(): Promise<OrderStatus> {
    return { state: 'PENDING', amountPaise: 0, paymentId: null };
  }
}

describe('billing page (/plan)', () => {
  const gateway = new FakeGateway();
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ PUBLIC_BASE_URL: 'https://tutor.chalkpis.com' }, { billing: gateway });
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    h.provider.sent = [];
    gateway.created = [];
  });

  const form = (url: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
    h.app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
      payload: new URLSearchParams(body).toString(),
    });
  const get = (url: string, cookie?: string) =>
    h.app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} });
  const lastCode = () => h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
  /** Signs in through the real code flow and returns the session cookie. */
  const signIn = async (phone: string) => {
    expect((await form('/plan/code', { phone })).statusCode).toBe(200);
    const r = await form('/plan/verify', { phone, code: lastCode() });
    expect(r.statusCode).toBe(303);
    const cookie = String(r.headers['set-cookie']).split(';')[0]!;
    expect(String(r.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Lax; Secure/);
    return cookie;
  };

  it('asks for the mobile number, then the WhatsApp code, then shows the centre', async () => {
    const t = await h.tenant('+919800000001', { institute: 'Sunrise <Dance>' });
    const start = await get('/plan');
    expect(start.statusCode).toBe(200);
    expect(start.body).toContain('action="/plan/code"');
    expect(start.headers['content-security-policy']).not.toContain('script-src');

    const code = await form('/plan/code', { phone: '98000 00001' });
    expect(code.body).toContain('Enter the code');
    expect(code.body).toContain('+91••••••0001');
    expect(h.provider.sent).toHaveLength(1);

    const bad = await form('/plan/verify', { phone: '9800000001', code: '000000' });
    expect(bad.statusCode).toBe(401);

    const ok = await form('/plan/verify', { phone: '9800000001', code: lastCode() });
    expect(ok.statusCode).toBe(303);
    expect(ok.headers.location).toBe('/plan');
    const cookie = String(ok.headers['set-cookie']).split(';')[0]!;
    expect(readPlanSession(SECRET, cookie, h.clock.now.getTime())).toBe(t.userId);

    const page = await get('/plan', cookie);
    expect(page.body).toContain('Sunrise &lt;Dance&gt;');
    expect(page.body).not.toContain('<Dance>');
    expect(page.body).toContain('Your free trial runs until');
    expect(page.body).toContain('Pay ₹2,999 for a year');
    expect(page.body).toContain('Pay ₹299 for a month');
    expect(page.body).toContain('Most popular');
    expect(page.body).toContain('No payments yet.');
  });

  it('a new number signs up from chalkpis.com: code, account, centre on a trial, then chalkpis.com/welcome', async () => {
    const start = await get('/start?utm_source=facebook&utm_campaign=dance&evil=%3Cx%3E');
    expect(start.statusCode).toBe(200);
    expect(start.body).toContain('Start your free trial');
    // only the utm_* values are kept, as one query string carried through the steps
    expect(start.body).toContain('name="src" value="utm_source=facebook&amp;utm_campaign=dance"');
    expect(start.body).not.toContain('evil');

    const src = 'utm_source=facebook&utm_campaign=dance';
    const code = await form('/plan/code', { phone: '9811111111', next: 'start', src });
    expect(code.statusCode).toBe(200);
    expect(h.provider.sent).toHaveLength(1); // a new number gets a code now
    const v = await form('/plan/verify', {
      phone: '9811111111',
      code: lastCode(),
      next: 'start',
      src,
    });
    expect(v.statusCode).toBe(303);
    expect(v.headers.location).toBe(
      `/plan/setup?${new URLSearchParams({ next: 'start', src }).toString()}`,
    );
    const cookie = String(v.headers['set-cookie']).split(';')[0]!;
    expect((await get(String(v.headers.location), cookie)).body).toContain('Set up your centre');

    const missing = await form(
      '/plan/setup',
      {
        tutorName: 'Meena',
        instituteName: 'Meena Dance School',
        category: 'dance',
        next: 'start',
        src,
      },
      { cookie },
    );
    expect(missing.statusCode).toBe(400);
    expect(missing.body).toContain('the phone you will use');
    expect(missing.body).toContain('value="Meena Dance School"'); // what was typed stays

    const done = await form(
      '/plan/setup',
      {
        tutorName: 'Meena',
        instituteName: 'Meena Dance School',
        category: 'dance',
        phone: 'android',
        next: 'start',
        src,
      },
      { cookie },
    );
    expect(done.statusCode).toBe(303);
    expect(done.headers.location).toBe('https://chalkpis.com/welcome?os=android');

    const [[row]] = (await h.db.pool.query(
      `SELECT i.name, i.category, i.signup_channel, i.signup_phone, i.signup_source, i.trial_on_first_app_use,
              i.first_app_sign_in_at, s.plan, s.expires_at
         FROM institutes i JOIN users u ON u.id = i.owner_user_id JOIN subscriptions s ON s.institute_id = i.id
        WHERE u.phone = ?`,
      ['+919811111111'],
    )) as unknown as [[Record<string, unknown>]];
    expect(row).toMatchObject({
      name: 'Meena Dance School',
      category: 'dance',
      signup_channel: 'web',
      signup_phone: 'android',
      signup_source: src,
      trial_on_first_app_use: 0,
      first_app_sign_in_at: null,
      plan: 'trial',
    });
    expect((row.expires_at as Date).getTime()).toBe(h.clock.now.getTime() + 7 * 86_400_000);

    const plan = await get('/plan', cookie);
    expect(plan.body).toContain('Meena Dance School');
    expect(plan.body).toContain('Your free trial runs until');
    expect(plan.body).toContain('Get it on Google Play'); // not in the app yet
    expect(plan.body).toContain('action="/plan/pay"'); // and can pay straight away
    // signing up again from chalkpis.com goes to the plan
    expect((await get('/start', cookie)).headers.location).toBe('/plan');
  });

  it('an iPhone owner’s trial waits for their first sign-in in the app, with no reminders before it', async () => {
    expect((await form('/plan/code', { phone: '9822222222' })).statusCode).toBe(200);
    const v = await form('/plan/verify', { phone: '9822222222', code: lastCode() });
    expect(v.headers.location).toBe('/plan/setup?next=plan&src=');
    const cookie = String(v.headers['set-cookie']).split(';')[0]!;
    const done = await form(
      '/plan/setup',
      { tutorName: 'Arun', instituteName: 'Arun Karate', category: 'karate', phone: 'ios' },
      { cookie },
    );
    expect(done.headers.location).toBe('/plan?welcome=1'); // came to pay: stays here
    const welcome = await get('/plan?welcome=1', cookie);
    expect(welcome.body).toContain('Your account is ready');
    expect(welcome.body).toContain('Your free trial starts when you first open the Chalkpis app');
    expect(welcome.body).toContain('iPhone app is coming soon to the App Store'); // iPhone first
    expect(welcome.body).not.toContain('class="button" href="https://play.google.com');

    const [[msg]] = (await h.db.pool.query(
      "SELECT vars FROM centre_messages WHERE type = 'centre_welcome'",
    )) as unknown as [[{ vars: string }]];
    expect(String(msg.vars)).toContain('7 days after you first open the app');

    // a month later, still waiting: no "your trial ends" reminder
    h.clock.now = new Date(h.clock.now.getTime() + 30 * 86_400_000);
    await queuePlanReminders(h.db.pool, h.clock.now, {
      baseUrl: 'https://tutor.chalkpis.com',
      secret: SECRET,
    });
    const [ending] = (await h.db.pool.query(
      "SELECT 1 FROM centre_messages WHERE type IN ('plan_ending','plan_ended')",
    )) as unknown as [unknown[]];
    expect(ending).toHaveLength(0);

    // the first sign-in in the app starts the full trial from that day
    const json = (url: string, payload: object) => h.app.inject({ method: 'POST', url, payload });
    expect((await json('/auth/otp/request', { phone: '9822222222' })).statusCode).toBe(200);
    expect(
      (await json('/auth/otp/verify', { phone: '9822222222', code: lastCode() })).statusCode,
    ).toBe(200);
    const [[after]] = (await h.db.pool.query(
      `SELECT i.trial_on_first_app_use, i.first_app_sign_in_at, s.expires_at FROM institutes i
         JOIN subscriptions s ON s.institute_id = i.id WHERE i.name = 'Arun Karate'`,
    )) as unknown as [
      [{ trial_on_first_app_use: number; first_app_sign_in_at: Date; expires_at: Date }],
    ];
    expect(after.trial_on_first_app_use).toBe(0);
    expect(after.first_app_sign_in_at.getTime()).toBe(h.clock.now.getTime());
    expect(after.expires_at.getTime()).toBe(h.clock.now.getTime() + 7 * 86_400_000);
    expect((await get('/plan', cookie)).body).not.toContain('Get it on Google Play'); // using the app now
  });

  it('a helper’s number is told to sign in with the owner’s, and gets no centre of its own', async () => {
    const t = await h.tenant('+919800000001');
    const helperId = 'helper-0000-0000-0000-000000000001';
    await h.db.pool.query('INSERT INTO users (id, phone, name) VALUES (?, ?, ?)', [
      helperId,
      '+919833333333',
      'Helper',
    ]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [helperId, t.instituteId],
    );
    const cookie = await signIn('9833333333');
    expect((await get('/plan', cookie)).body).toContain('This number is a helper');
    expect((await get('/plan/setup', cookie)).headers.location).toBe('/plan');
    const r = await form(
      '/plan/setup',
      {
        tutorName: 'Helper',
        instituteName: 'Helper School',
        category: 'tuition',
        phone: 'android',
      },
      { cookie },
    );
    expect(r.headers.location).toBe('/plan');
    const [mine] = (await h.db.pool.query('SELECT 1 FROM institutes WHERE owner_user_id = ?', [
      helperId,
    ])) as unknown as [unknown[]];
    expect(mine).toHaveLength(0);
  });

  it('refuses a bad number, and a changed or missing cookie means signed out', async () => {
    expect((await form('/plan/code', { phone: '12345' })).statusCode).toBe(400);
    await h.tenant('+919800000001');
    const cookie = await signIn('9800000001');
    const tampered = `${cookie.slice(0, -2)}xx`;
    expect((await get('/plan', tampered)).body).toContain('action="/plan/code"');
  });

  it('paying opens the gateway for the signed-in owner’s centre only', async () => {
    const t = await h.tenant('+919800000001');
    const other = await h.tenant('+919800000002');
    const cookie = await signIn('9800000001');

    const r = await form('/plan/pay', { plan: 'standard', centre: t.instituteId }, { cookie });
    expect(r.statusCode).toBe(200);
    expect(gateway.created[0]).toMatchObject({
      amountPaise: PLANS.standard.prices.year,
      customerPhone: '+919800000001',
    });
    expect(r.body).toContain(`url=https://rzp.io/i/`);

    // another owner's centre, a form from another site, or no sign-in: nothing is created
    await form('/plan/pay', { plan: 'pro', centre: other.instituteId }, { cookie });
    await form(
      '/plan/pay',
      { plan: 'pro', centre: t.instituteId },
      { cookie, origin: 'https://evil.example' },
    );
    await form('/plan/pay', { plan: 'pro', centre: t.instituteId });
    expect(gateway.created).toHaveLength(1);
  });

  it('shows past payments with a receipt only its own owner can open', async () => {
    const t = await h.tenant('+919800000001', { institute: 'Sunrise Dance' });
    await h.tenant('+919800000002');
    await h.db.pool.query(
      "INSERT INTO billing_events (payment_id, provider, institute_id, plan_id, amount, status, expires_at) VALUES ('cf_777', 'cashfree', ?, 'pro', 99900, 'applied', ?)",
      [t.instituteId, new Date('2027-10-13T00:00:00Z')],
    );
    const cookie = await signIn('9800000001');
    const page = await get('/plan', cookie);
    expect(page.body).toContain('₹999');
    expect(page.body).toContain(`/plan/receipt/cf_777?centre=${t.instituteId}`);

    const receipt = await get(`/plan/receipt/cf_777?centre=${t.instituteId}`, cookie);
    expect(receipt.statusCode).toBe(200);
    expect(receipt.body).toContain('Payment receipt');
    expect(receipt.body).toContain('Sunrise Dance');
    expect(receipt.body).toContain('Cashfree Payments');

    const otherCookie = await signIn('9800000002');
    const denied = await get(`/plan/receipt/cf_777?centre=${t.instituteId}`, otherCookie);
    expect(denied.statusCode).toBe(404);
  });

  it('signing out clears the cookie', async () => {
    await h.tenant('+919800000001');
    const cookie = await signIn('9800000001');
    const r = await form('/plan/logout', {}, { cookie });
    expect(r.statusCode).toBe(303);
    expect(String(r.headers['set-cookie'])).toMatch(/^cp_plan=; Path=\/plan; Max-Age=0/);
  });
});
