import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readPlanSession } from '../src/billing/planSession.js';
import { PLANS } from '../src/billing/plans.js';
import type { BillingProvider, LinkRequest, OrderStatus } from '../src/billing/provider.js';
import { startHarness, type Harness } from './helpers.js';

const SECRET = 'test-jwt-secret-test-jwt-secret-1234';

class FakeGateway implements BillingProvider {
  name = 'cashfree' as const;
  created: LinkRequest[] = [];
  async createPaymentLink(req: LinkRequest) {
    this.created.push(req);
    return {
      id: req.referenceId,
      url: `https://tutor.chalkpis.com/billing/checkout/${req.referenceId}`,
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
    expect(page.body).toContain('Pay ₹699');
    expect(page.body).toContain('No payments yet.');
  });

  it('never creates an account for a number that has none', async () => {
    await form('/plan/code', { phone: '9811111111' });
    const r = await form('/plan/verify', { phone: '9811111111', code: lastCode() });
    expect(r.body).toContain('No centre on this number');
    expect(r.headers['set-cookie']).toBeUndefined();
    const [users] = (await h.db.pool.query('SELECT id FROM users WHERE phone = ?', [
      '+919811111111',
    ])) as unknown as [unknown[]];
    expect(users).toHaveLength(0);
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
      amountPaise: PLANS.standard.pricePaise,
      customerPhone: '+919800000001',
    });
    expect(r.body).toContain(`url=https://tutor.chalkpis.com/billing/checkout/`);

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
