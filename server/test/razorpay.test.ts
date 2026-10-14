import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parsePayToken, payToken } from '../src/billing/payLink.js';
import { PLANS } from '../src/billing/plans.js';
import {
  RazorpayProvider,
  type BillingProvider,
  type LinkRequest,
  type OrderStatus,
} from '../src/billing/provider.js';
import { makeJobs, runDueJobs } from '../src/jobs/runner.js';
import { WEBHOOK_SECRET, startHarness, type Harness, type Tenant } from './helpers.js';

const JWT = 'test-jwt-secret-test-jwt-secret-1234';

function fakeFetch(answers: Record<string, unknown>, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    if (!key) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(answers[key]), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('RazorpayProvider', () => {
  const nowMs = () => Date.parse('2026-10-13T10:00:00Z');

  it('creates a payment link with our order id, the return page and a one-hour expiry', async () => {
    const f = fakeFetch({ '/payment_links': { id: 'plink_1', short_url: 'https://rzp.io/i/abc' } });
    const p = new RazorpayProvider('rzp_key', 'rzp_secret', f.fn, nowMs);
    expect(
      await p.createPaymentLink({
        amountPaise: 69900,
        description: 'Chalkpis Standard plan (6 months)',
        referenceId: 'ord-1',
        customerPhone: '+919800000001',
        returnUrl: 'https://tutor.chalkpis.com/billing/return?order=ord-1',
      }),
    ).toEqual({ id: 'plink_1', url: 'https://rzp.io/i/abc' });
    const call = f.calls[0]!;
    expect(call.url).toBe('https://api.razorpay.com/v1/payment_links');
    expect((call.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('rzp_key:rzp_secret').toString('base64')}`,
    );
    expect(JSON.parse(call.init.body as string)).toMatchObject({
      amount: 69900,
      currency: 'INR',
      accept_partial: false,
      reference_id: 'ord-1',
      customer: { contact: '+919800000001' },
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: Math.floor(nowMs() / 1000) + 3600,
      callback_url: 'https://tutor.chalkpis.com/billing/return?order=ord-1',
      callback_method: 'get',
    });
  });

  it('needs no mobile number, and keeps Razorpay’s reason when it refuses', async () => {
    const f = fakeFetch({ '/payment_links': { id: 'plink_2', short_url: 'https://rzp.io/i/x' } });
    await new RazorpayProvider('k', 's', f.fn).createPaymentLink({
      amountPaise: 100,
      description: 'd',
      referenceId: 'r',
    });
    expect(JSON.parse(f.calls[0]!.init.body as string).customer).toBeUndefined();
    const refused = fakeFetch(
      { '/payment_links': { error: { code: 'BAD_REQUEST_ERROR', description: 'Bad key' } } },
      401,
    );
    await expect(
      new RazorpayProvider('k', 's', refused.fn).createPaymentLink({
        amountPaise: 1,
        description: 'd',
        referenceId: 'r',
      }),
    ).rejects.toThrow('razorpay-401: BAD_REQUEST_ERROR Bad key');
  });

  it('reads a paid link as COMPLETED with the captured payment, and the rest as pending or failed', async () => {
    const status = (link: unknown) =>
      new RazorpayProvider('k', 's', fakeFetch({ '/payment_links/plink_9': link }).fn).checkStatus(
        'plink_9',
      );
    expect(
      await status({
        status: 'paid',
        amount_paid: 69900,
        payments: [{ payment_id: 'pay_ABC', status: 'captured', amount: 69900 }],
      }),
    ).toEqual({ state: 'COMPLETED', amountPaise: 69900, paymentId: 'pay_ABC' });
    expect((await status({ status: 'created', payments: null })).state).toBe('PENDING');
    expect((await status({ status: 'paid', payments: [] })).state).toBe('PENDING');
    expect((await status({ status: 'expired' })).state).toBe('FAILED');
    expect((await status({ status: 'cancelled' })).state).toBe('FAILED');
  });
});

describe('pay page tokens', () => {
  const id = '0b6f3c1e-1111-4222-8333-944445555666';
  it('round-trips a centre id and rejects tampering or another secret', () => {
    const t = payToken('s1', id);
    expect(t).toMatch(/^[A-Za-z0-9_-]{38}$/);
    expect(parsePayToken('s1', t)).toBe(id);
    expect(parsePayToken('s2', t)).toBeNull();
    expect(parsePayToken('s1', `${t.slice(0, -1)}${t.endsWith('A') ? 'B' : 'A'}`)).toBeNull();
    expect(parsePayToken('s1', 'short')).toBeNull();
  });
});

/** Stands in for Razorpay: hands out links and answers status questions from a table we control. */
class FakeRazorpay implements BillingProvider {
  name = 'razorpay' as const;
  created: LinkRequest[] = [];
  status = new Map<string, OrderStatus>();
  async createPaymentLink(req: LinkRequest) {
    this.created.push(req);
    return {
      id: `plink_${req.referenceId.slice(0, 8)}`,
      url: `https://rzp.io/i/${req.referenceId}`,
    };
  }
  async checkStatus(linkId: string) {
    return (
      this.status.get(linkId) ?? { state: 'PENDING' as const, amountPaise: 0, paymentId: null }
    );
  }
}

describe('Razorpay plan purchases', () => {
  const fake = new FakeRazorpay();
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness({ PUBLIC_BASE_URL: 'https://tutor.chalkpis.com' }, { billing: fake });
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    fake.created = [];
    fake.status.clear();
  });

  const payPage = (t: { instituteId: string }) => `/pay/${payToken(JWT, t.instituteId)}`;
  const post = (url: string, form: string) =>
    h.app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form,
    });
  const linkOf = (orderId: string) => `plink_${orderId.slice(0, 8)}`;
  const paid = (orderId: string, paymentId = 'pay_1', plan: keyof typeof PLANS = 'standard') =>
    fake.status.set(linkOf(orderId), {
      state: 'COMPLETED',
      amountPaise: PLANS[plan].prices.year,
      paymentId,
    });
  const history = async (t: Tenant) =>
    (await t.call('GET', '/billing')).body.history as { paymentId: string; provider: string }[];

  it('the app gets a Razorpay link that sends the payer back to the return page', async () => {
    const t = await h.tenant('+919800000001');
    const r = await t.call('POST', '/billing/links', { planId: 'starter' });
    expect(r.status).toBe(201);
    expect(r.body.url).toBe(`https://rzp.io/i/${r.body.orderId}`);
    expect(fake.created[0]).toEqual({
      referenceId: r.body.orderId,
      amountPaise: PLANS.starter.prices.year,
      description: expect.stringContaining('Starter'),
      customerPhone: '+919800000001',
      returnUrl: `https://tutor.chalkpis.com/billing/return?order=${r.body.orderId}`,
    });
  });

  it('the return page asks Razorpay (ignoring what the URL says) and applies the plan once', async () => {
    const t = await h.tenant('+919800000001');
    const orderId = (await t.call('POST', '/billing/links', { planId: 'standard' })).body.orderId;
    // Razorpay adds its own values to the return address; a forged "paid" there changes nothing
    const back = `/billing/return?order=${orderId}&razorpay_payment_id=pay_fake&razorpay_payment_link_status=paid`;
    const waiting = await h.app.inject({ method: 'GET', url: back });
    expect(waiting.body).toContain('Payment in progress');
    expect(await history(t)).toHaveLength(0);

    paid(orderId);
    expect((await h.app.inject({ method: 'GET', url: back })).body).toContain('Payment received');
    expect((await h.app.inject({ method: 'GET', url: back })).body).toContain('Payment received');
    expect(await history(t)).toEqual([
      expect.objectContaining({ paymentId: 'pay_1', provider: 'razorpay', planId: 'standard' }),
    ]);
    expect((await t.call('GET', '/subscription')).body.plan).toBe('standard');
  });

  it('the signed webhook and a later check apply the same payment only once', async () => {
    const t = await h.tenant('+919800000001');
    const orderId = (await t.call('POST', '/billing/links', { planId: 'standard' })).body.orderId;
    const raw = JSON.stringify({
      event: 'payment_link.paid',
      payload: {
        payment_link: { entity: { id: linkOf(orderId), amount_paid: PLANS.standard.prices.year } },
        payment: { entity: { id: 'pay_W' } },
      },
    });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const r = await h.app.inject({
      method: 'POST',
      url: '/billing/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig },
      payload: raw,
    });
    expect(r.json()).toMatchObject({ result: 'applied' });
    paid(orderId, 'pay_W');
    expect((await t.call('GET', `/billing/orders/${orderId}`)).body.state).toBe('paid');
    expect(await history(t)).toHaveLength(1);
  });

  it('a payment never confirmed back is picked up when the owner looks, or by the hourly job', async () => {
    const t = await h.tenant('+919800000001');
    const first = (await t.call('POST', '/billing/links', { planId: 'standard' })).body.orderId;
    paid(first, 'pay_lost');
    // the app's billing screen asks Razorpay about recent unconfirmed orders
    expect(await history(t)).toEqual([expect.objectContaining({ paymentId: 'pay_lost' })]);

    const u = await h.tenant('+919800000002');
    const second = (await u.call('POST', '/billing/links', { planId: 'pro' })).body.orderId;
    paid(second, 'pay_job', 'pro');
    const ran = await runDueJobs(
      h.db.pool,
      h.clock.now,
      { info: () => {}, error: () => {} },
      makeJobs(undefined, fake),
    );
    expect(ran).toContain('billing-reconcile');
    expect((await u.call('GET', '/subscription')).body.plan).toBe('pro');
  });

  it('a wrong amount is refused and stays refused', async () => {
    const t = await h.tenant('+919800000001');
    const orderId = (await t.call('POST', '/billing/links', { planId: 'pro' })).body.orderId;
    fake.status.set(linkOf(orderId), { state: 'COMPLETED', amountPaise: 100, paymentId: 'pay_x' });
    expect((await t.call('GET', `/billing/orders/${orderId}`)).body.state).toBe('failed');
    expect((await t.call('GET', `/billing/orders/${orderId}`)).body.state).toBe('failed');
    expect((await t.call('GET', '/subscription')).body.plan).toBe('trial');
  });

  it('the app can ask about its own order; another centre cannot', async () => {
    const t = await h.tenant('+919800000001');
    const other = await h.tenant('+919800000002');
    const orderId = (await t.call('POST', '/billing/links', { planId: 'starter' })).body.orderId;
    expect((await t.call('GET', `/billing/orders/${orderId}`)).body.state).toBe('pending');
    expect((await other.call('GET', `/billing/orders/${orderId}`)).status).toBe(404);
  });

  it('the pay page shows the centre and its plans, and a bad link shows nothing', async () => {
    const t = await h.tenant('+919800000001', { institute: 'Sunrise <Karate>' });
    const r = await h.app.inject({ method: 'GET', url: payPage(t) });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-security-policy']).not.toContain('script-src');
    expect(r.body).toContain('Sunrise &lt;Karate&gt;');
    expect(r.body).not.toContain('<Karate>');
    expect(r.body).toContain('Pay ₹1,999 for a year');
    expect(r.body).toContain('Razorpay');
    expect(r.body).not.toContain('Cashfree');
    expect((await h.app.inject({ method: 'GET', url: `/pay/${'A'.repeat(38)}` })).statusCode).toBe(
      404,
    );
  });

  it('paying on the pay page opens the Razorpay link for that centre; a wrong plan is refused', async () => {
    const t = await h.tenant('+919800000001');
    const r = await post(payPage(t), 'plan=pro');
    expect(r.statusCode).toBe(200);
    const order = fake.created[0]!;
    expect(order).toMatchObject({ amountPaise: PLANS.pro.prices.year });
    expect(r.body).toContain(`url=https://rzp.io/i/${order.referenceId}`);
    const [rows] = (await h.db.pool.query(
      'SELECT institute_id, plan_id, provider FROM billing_orders WHERE id = ?',
      [order.referenceId],
    )) as unknown as [{ institute_id: string; plan_id: string; provider: string }[]];
    expect(rows[0]).toEqual({ institute_id: t.instituteId, plan_id: 'pro', provider: 'razorpay' });
    expect((await post(payPage(t), 'plan=gold')).statusCode).toBe(400);
    expect(fake.created).toHaveLength(1);
  });

  it('the old Cashfree checkout page and webhooks are gone', async () => {
    for (const url of [
      '/billing/checkout/0b6f3c1e-1111-4222-8333-944445555666',
      '/billing/checkout.js',
    ])
      expect((await h.app.inject({ method: 'GET', url })).statusCode).toBe(404);
    for (const url of ['/billing/webhooks/cashfree', '/billing/webhooks/phonepe'])
      expect((await h.app.inject({ method: 'POST', url, payload: {} })).statusCode).toBe(404);
  });

  it('the admin sees the pay page link for a centre', async () => {
    const t = await h.tenant('+919800000001');
    const admin = await h.admin();
    const r = await admin.call('GET', `/admin/api/institutes/${t.instituteId}`);
    expect(r.status).toBe(200);
    expect(r.body.payUrl).toBe(`https://tutor.chalkpis.com${payPage(t)}`);
  });
});
