import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { parsePayToken, payToken } from '../src/billing/payLink.js';
import { PLANS } from '../src/billing/plans.js';
import {
  CashfreeProvider,
  cashfreeLinkId,
  istIso,
  verifyCashfreeSignature,
  type BillingProvider,
  type LinkRequest,
  type OrderStatus,
} from '../src/billing/provider.js';
import { startHarness, type Harness } from './helpers.js';

const SECRET = 'cfsk_test_secret_key_0123456789';
const sign = (ts: string, raw: string) =>
  createHmac('sha256', SECRET)
    .update(ts + raw)
    .digest('base64');

/** Records what is sent to Cashfree and answers from a script. */
function fakeFetch(answers: Record<string, unknown>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    if (!key) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify(answers[key]), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('CashfreeProvider', () => {
  const opts = { appId: 'app_1', secretKey: 'sk_1', env: 'sandbox' as const };
  const nowMs = () => Date.parse('2026-10-13T10:00:00Z');

  it('creates a payment link with our order id, the price in rupees and no Cashfree SMS or email', async () => {
    const f = fakeFetch({ '/links': { link_url: 'https://payments-test.cashfree.com/links/abc' } });
    const p = new CashfreeProvider(opts, f.fn, nowMs);
    const link = await p.createPaymentLink({
      amountPaise: 69900,
      description: 'Chalkpis Standard plan (6 months)',
      referenceId: '0b6f3c1e-1111-4222-8333-944445555666',
      customerPhone: '+919800000001',
      returnUrl: 'https://tutor.chalkpis.com/billing/return?order=x',
      notifyUrl: 'https://tutor.chalkpis.com/billing/webhooks/cashfree',
    });
    expect(link).toEqual({
      id: '0b6f3c1e-1111-4222-8333-944445555666',
      url: 'https://payments-test.cashfree.com/links/abc',
    });
    const call = f.calls[0]!;
    expect(call.url).toBe('https://sandbox.cashfree.com/pg/links');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['x-client-id']).toBe('app_1');
    expect(headers['x-client-secret']).toBe('sk_1');
    expect(headers['x-api-version']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.parse(call.init.body as string)).toMatchObject({
      link_id: '0b6f3c1e-1111-4222-8333-944445555666',
      link_amount: 699,
      link_currency: 'INR',
      link_partial_payments: false,
      customer_details: { customer_phone: '9800000001' },
      link_expiry_time: '2026-10-13T16:30:00+05:30',
      link_meta: {
        return_url: 'https://tutor.chalkpis.com/billing/return?order=x',
        notify_url: 'https://tutor.chalkpis.com/billing/webhooks/cashfree',
      },
      link_notify: { send_sms: false, send_email: false },
    });
  });

  it('refuses to create a link without a mobile number (Cashfree needs one)', async () => {
    const p = new CashfreeProvider(opts, fakeFetch({}).fn, nowMs);
    await expect(
      p.createPaymentLink({ amountPaise: 100, description: 'x', referenceId: 'r' }),
    ).rejects.toThrow('cashfree-no-phone');
  });

  it('reads a paid link as COMPLETED with the paid order as the payment id', async () => {
    const f = fakeFetch({
      '/links/L1': { link_status: 'PAID', link_amount_paid: 699 },
      '/links/L1/orders?status=PAID': [
        { order_id: 'CFPay_b', order_status: 'PAID' },
        { order_id: 'CFPay_a', order_status: 'PAID' },
      ],
    });
    const p = new CashfreeProvider({ ...opts, env: 'production' }, f.fn, nowMs);
    expect(await p.checkStatus('L1')).toEqual({
      state: 'COMPLETED',
      amountPaise: 69900,
      paymentId: 'CFPay_a',
    });
    expect(f.calls[0]!.url).toBe('https://api.cashfree.com/pg/links/L1');
  });

  it('reads active links as PENDING and expired or cancelled ones as FAILED', async () => {
    const status = async (link_status: string) =>
      new CashfreeProvider(opts, fakeFetch({ '/links/L': { link_status } }).fn).checkStatus('L');
    expect((await status('ACTIVE')).state).toBe('PENDING');
    expect((await status('PARTIALLY_PAID')).state).toBe('PENDING');
    expect((await status('EXPIRED')).state).toBe('FAILED');
    expect((await status('CANCELLED')).state).toBe('FAILED');
  });

  it('writes Cashfree times in IST without milliseconds', () => {
    expect(istIso(new Date('2026-10-13T18:45:30.123Z'))).toBe('2026-10-14T00:15:30+05:30');
  });
});

describe('Cashfree webhook helpers', () => {
  it('checks the signature over timestamp + the exact body', () => {
    const raw = '{"type":"PAYMENT_LINK_EVENT","data":{"link_id":"L1"}}';
    expect(verifyCashfreeSignature(raw, '1760000000', sign('1760000000', raw), SECRET)).toBe(true);
    expect(verifyCashfreeSignature(`${raw} `, '1760000000', sign('1760000000', raw), SECRET)).toBe(
      false,
    );
    expect(verifyCashfreeSignature(raw, '1760000001', sign('1760000000', raw), SECRET)).toBe(false);
    expect(verifyCashfreeSignature(raw, undefined, sign('1760000000', raw), SECRET)).toBe(false);
    expect(verifyCashfreeSignature(raw, '1', 'x', undefined)).toBe(false);
  });

  it('finds the link id in JSON or form bodies, and ignores other events', () => {
    expect(cashfreeLinkId('{"type":"PAYMENT_LINK_EVENT","data":{"link_id":"abc-1"}}')).toBe(
      'abc-1',
    );
    expect(cashfreeLinkId('link_id=abc-2&link_status=PAID')).toBe('abc-2');
    expect(cashfreeLinkId('{"type":"PAYMENT_SUCCESS_WEBHOOK","data":{}}')).toBeNull();
    expect(cashfreeLinkId('{"type":"PAYMENT_LINK_EVENT","data":{"link_id":"<x>"}}')).toBeNull();
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

/** Stands in for Cashfree: hands out link URLs and answers status questions from a table we control. */
class FakeCashfree implements BillingProvider {
  name = 'cashfree' as const;
  created: LinkRequest[] = [];
  status = new Map<string, OrderStatus>();
  async createPaymentLink(req: LinkRequest) {
    this.created.push(req);
    return {
      id: req.referenceId,
      url: `https://payments-test.cashfree.com/links/${req.referenceId}`,
    };
  }
  async checkStatus(linkId: string) {
    return (
      this.status.get(linkId) ?? { state: 'PENDING' as const, amountPaise: 0, paymentId: null }
    );
  }
}

describe('Cashfree plan purchases', () => {
  const fake = new FakeCashfree();
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness(
      { PUBLIC_BASE_URL: 'https://tutor.chalkpis.com', CASHFREE_SECRET_KEY: SECRET },
      { billing: fake },
    );
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    fake.created = [];
    fake.status.clear();
  });

  const hook = (raw: string, sig?: string, ts = '1760000000') =>
    h.app.inject({
      method: 'POST',
      url: '/billing/webhooks/cashfree',
      headers: {
        'content-type': 'application/json',
        'x-webhook-timestamp': ts,
        'x-webhook-signature': sig ?? sign(ts, raw),
      },
      payload: raw,
    });
  const payPage = (t: { instituteId: string }) =>
    `/pay/${payToken('test-jwt-secret-test-jwt-secret-1234', t.instituteId)}`;
  const post = (url: string, form: string) =>
    h.app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: form,
    });

  it('the app gets a Cashfree link with the return page and the webhook address', async () => {
    const t = await h.tenant('+919800000001');
    const r = await t.call('POST', '/billing/links', { planId: 'starter' });
    expect(r.status).toBe(201);
    expect(fake.created[0]).toMatchObject({
      referenceId: r.body.orderId,
      amountPaise: PLANS.starter.pricePaise,
      customerPhone: '+919800000001',
      returnUrl: `https://tutor.chalkpis.com/billing/return?order=${r.body.orderId}`,
      notifyUrl: 'https://tutor.chalkpis.com/billing/webhooks/cashfree',
    });
  });

  it('a signed webhook applies the plan only after Cashfree itself says paid, and only once', async () => {
    const t = await h.tenant('+919800000001');
    const orderId = (await t.call('POST', '/billing/links', { planId: 'standard' })).body.orderId;
    const raw = JSON.stringify({
      type: 'PAYMENT_LINK_EVENT',
      data: { link_id: orderId, link_status: 'PAID' },
    });

    expect((await hook(raw)).json()).toMatchObject({ state: 'pending' }); // Cashfree has not confirmed yet
    expect((await t.call('GET', '/billing')).body.history).toHaveLength(0);

    fake.status.set(orderId, {
      state: 'COMPLETED',
      amountPaise: PLANS.standard.pricePaise,
      paymentId: 'CFPay_1',
    });
    expect((await hook(raw)).json()).toMatchObject({ state: 'paid' });
    expect((await hook(raw)).json()).toMatchObject({ state: 'paid' }); // replay
    const history = (await t.call('GET', '/billing')).body.history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      paymentId: 'CFPay_1',
      provider: 'cashfree',
      planId: 'standard',
    });
  });

  it('refuses a webhook with a bad signature and acknowledges other events', async () => {
    const raw = JSON.stringify({ type: 'PAYMENT_LINK_EVENT', data: { link_id: 'x' } });
    expect((await hook(raw, 'bad')).statusCode).toBe(401);
    const other = JSON.stringify({ type: 'REFUND_STATUS_WEBHOOK', data: {} });
    expect((await hook(other)).json()).toMatchObject({ ignored: true });
  });

  it('the pay page shows the centre and its plans, and a bad link shows nothing', async () => {
    const t = await h.tenant('+919800000001', { institute: 'Sunrise <Karate>' });
    const r = await h.app.inject({ method: 'GET', url: payPage(t) });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-security-policy']).not.toContain('script-src');
    expect(r.headers['content-security-policy']).toContain("default-src 'none'");
    expect(r.body).toContain('Sunrise &lt;Karate&gt;');
    expect(r.body).not.toContain('<Karate>');
    expect(r.body).toContain('Pay ₹399');
    expect(r.body).toContain('Pay ₹999');
    expect(r.body).toContain('Cashfree');
    const bad = await h.app.inject({ method: 'GET', url: `/pay/${'A'.repeat(38)}` });
    expect(bad.statusCode).toBe(404);
  });

  it('paying on the pay page opens the Cashfree link for that centre; a wrong plan is refused', async () => {
    const t = await h.tenant('+919800000001');
    const r = await post(payPage(t), 'plan=pro');
    expect(r.statusCode).toBe(200);
    const order = fake.created[0]!;
    expect(order).toMatchObject({
      amountPaise: PLANS.pro.pricePaise,
      customerPhone: '+919800000001',
    });
    expect(r.body).toContain(`url=https://payments-test.cashfree.com/links/${order.referenceId}`);
    const [rows] = (await h.db.pool.query(
      'SELECT institute_id, plan_id, provider FROM billing_orders WHERE id = ?',
      [order.referenceId],
    )) as unknown as [{ institute_id: string; plan_id: string; provider: string }[]];
    expect(rows[0]).toEqual({ institute_id: t.instituteId, plan_id: 'pro', provider: 'cashfree' });

    expect((await post(payPage(t), 'plan=gold')).statusCode).toBe(400);
    expect(fake.created).toHaveLength(1);
  });

  it('the admin sees the pay page link for a centre', async () => {
    const t = await h.tenant('+919800000001');
    const admin = await h.admin();
    const r = await admin.call('GET', `/admin/api/institutes/${t.instituteId}`);
    expect(r.status).toBe(200);
    expect(r.body.payUrl).toBe(`https://tutor.chalkpis.com${payPage(t)}`);
  });
});
