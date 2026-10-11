import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PhonePeProvider,
  phonePeOrderId,
  verifyPhonePeAuth,
  type BillingProvider,
  type LinkRequest,
  type OrderStatus,
} from '../src/billing/provider.js';
import { PLANS } from '../src/billing/plans.js';
import { startHarness, type Harness } from './helpers.js';

const USER = 'chalkpis-hook';
const PASS = 'a-long-webhook-password';
const AUTH = createHash('sha256').update(`${USER}:${PASS}`).digest('hex');

/** Stands in for PhonePe: hands out checkout URLs and answers status questions from a table we control. */
class FakePhonePe implements BillingProvider {
  name = 'phonepe' as const;
  created: LinkRequest[] = [];
  status = new Map<string, OrderStatus>();
  async createPaymentLink(req: LinkRequest) {
    this.created.push(req);
    return { id: req.referenceId, url: `https://mercury.phonepe.test/pay/${req.referenceId}` };
  }
  async checkStatus(linkId: string) {
    return (
      this.status.get(linkId) ?? { state: 'PENDING' as const, amountPaise: 0, paymentId: null }
    );
  }
}

describe('PhonePe plan purchases', () => {
  const fake = new FakePhonePe();
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness(
      {
        PUBLIC_BASE_URL: 'https://tutor.chalkpis.com',
        PHONEPE_WEBHOOK_USERNAME: USER,
        PHONEPE_WEBHOOK_PASSWORD: PASS,
      },
      { billing: fake },
    );
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    fake.created = [];
    fake.status.clear();
  });

  const buy = async () => {
    const t = await h.tenant('+919800000001');
    const r = await t.call('POST', '/billing/links', { planId: 'standard' });
    expect(r.status).toBe(201);
    return { t, orderId: r.body.orderId as string };
  };
  const hook = (body: unknown, auth = AUTH) =>
    h.app.inject({
      method: 'POST',
      url: '/billing/webhooks/phonepe',
      headers: { 'content-type': 'application/json', authorization: auth },
      payload: JSON.stringify(body),
    });

  it('creates a PhonePe checkout with our order id and a return page', async () => {
    const { orderId } = await buy();
    expect(fake.created[0]).toMatchObject({
      referenceId: orderId,
      amountPaise: PLANS.standard.pricePaise,
      returnUrl: `https://tutor.chalkpis.com/billing/return?order=${orderId}`,
    });
  });

  it('a webhook applies the plan only after PhonePe itself says COMPLETED, and only once', async () => {
    const { t, orderId } = await buy();
    const body = {
      event: 'checkout.order.completed',
      payload: { merchantOrderId: orderId, state: 'COMPLETED' },
    };

    // the body says completed, but PhonePe does not (yet): nothing is applied
    expect((await hook(body)).json()).toMatchObject({ state: 'pending' });
    expect((await t.call('GET', '/billing')).body.history).toHaveLength(0);

    fake.status.set(orderId, {
      state: 'COMPLETED',
      amountPaise: PLANS.standard.pricePaise,
      paymentId: 'T123',
    });
    expect((await hook(body)).json()).toMatchObject({ state: 'paid' });
    expect((await hook(body)).json()).toMatchObject({ state: 'paid' }); // replay
    const history = (await t.call('GET', '/billing')).body.history;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      paymentId: 'T123',
      provider: 'phonepe',
      planId: 'standard',
    });
  });

  it('refuses a webhook with the wrong Authorization, and ignores other events', async () => {
    const { orderId } = await buy();
    fake.status.set(orderId, {
      state: 'COMPLETED',
      amountPaise: PLANS.standard.pricePaise,
      paymentId: 'T1',
    });
    const body = { event: 'checkout.order.completed', payload: { merchantOrderId: orderId } };
    expect((await hook(body, 'nope')).statusCode).toBe(401);
    expect((await hook({ event: 'pg.refund.completed', payload: {} })).json()).toMatchObject({
      ignored: true,
    });
  });

  it('a payment for the wrong amount is refused', async () => {
    const { t, orderId } = await buy();
    fake.status.set(orderId, { state: 'COMPLETED', amountPaise: 100, paymentId: 'T9' });
    const r = await t.call('GET', `/billing/orders/${orderId}`);
    expect(r.body.state).toBe('failed');
    expect((await t.call('GET', '/billing')).body.history).toHaveLength(0);
  });

  it('the app can ask about its own order; another centre cannot', async () => {
    const { t, orderId } = await buy();
    expect((await t.call('GET', `/billing/orders/${orderId}`)).body.state).toBe('pending');
    fake.status.set(orderId, { state: 'FAILED', amountPaise: 0, paymentId: null });
    expect((await t.call('GET', `/billing/orders/${orderId}`)).body.state).toBe('failed');
    const other = await h.tenant('+919800000002');
    expect((await other.call('GET', `/billing/orders/${orderId}`)).status).toBe(404);
  });

  it('the return page confirms with PhonePe and shows the result', async () => {
    const { orderId } = await buy();
    fake.status.set(orderId, {
      state: 'COMPLETED',
      amountPaise: PLANS.standard.pricePaise,
      paymentId: 'T7',
    });
    const r = await h.app.inject({ method: 'GET', url: `/billing/return?order=${orderId}` });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('Payment received');
    const bad = await h.app.inject({ method: 'GET', url: '/billing/return?order=<script>' });
    expect(bad.body).toContain('Order not found');
    expect(bad.body).not.toContain('<script>');
  });
});

describe('PhonePeProvider', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const replies: { status: number; body: unknown }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  const p = () =>
    new PhonePeProvider(
      { clientId: 'CID', clientSecret: 'SECRET', clientVersion: '1', env: 'sandbox' },
      fetchFn,
      () => 1_700_000_000_000,
    );
  beforeEach(() => {
    calls.length = 0;
    replies.length = 0;
  });

  it('gets a token, then creates the checkout with O-Bearer and our order id', async () => {
    replies.push(
      { status: 200, body: { access_token: 'TOK', expires_at: 1_700_003_600 } },
      { status: 200, body: { orderId: 'OMO1', state: 'PENDING', redirectUrl: 'https://pay/OMO1' } },
    );
    const link = await p().createPaymentLink({
      amountPaise: 49900,
      description: 'Chalkpis Standard',
      referenceId: 'order-1',
      returnUrl: 'https://tutor.chalkpis.com/billing/return?order=order-1',
    });
    expect(link).toEqual({ id: 'order-1', url: 'https://pay/OMO1' });
    expect(calls[0]!.url).toBe('https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token');
    expect(String(calls[0]!.init.body)).toContain('grant_type=client_credentials');
    expect(calls[1]!.url).toBe('https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay');
    expect((calls[1]!.init.headers as Record<string, string>).Authorization).toBe('O-Bearer TOK');
    expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({
      merchantOrderId: 'order-1',
      amount: 49900,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl: expect.stringContaining('order-1') },
      },
    });
  });

  it('reads the order status and the completed transaction id; retries once on 401', async () => {
    replies.push(
      { status: 200, body: { access_token: 'OLD', expires_at: 1_700_003_600 } },
      { status: 401, body: {} },
      { status: 200, body: { access_token: 'NEW', expires_at: 1_700_003_600 } },
      {
        status: 200,
        body: {
          state: 'COMPLETED',
          amount: 49900,
          paymentDetails: [{ transactionId: 'T1', state: 'COMPLETED' }],
        },
      },
    );
    expect(await p().checkStatus('order-1')).toEqual({
      state: 'COMPLETED',
      amountPaise: 49900,
      paymentId: 'T1',
    });
    expect(calls[3]!.url).toContain('/checkout/v2/order/order-1/status');
  });

  it('checks the webhook Authorization and reads the order id', () => {
    expect(verifyPhonePeAuth(AUTH, USER, PASS)).toBe(true);
    expect(verifyPhonePeAuth(`SHA256 ${AUTH.toUpperCase()}`, USER, PASS)).toBe(true);
    expect(verifyPhonePeAuth('x', USER, PASS)).toBe(false);
    expect(verifyPhonePeAuth(AUTH, undefined, PASS)).toBe(false);
    expect(
      phonePeOrderId({ event: 'checkout.order.failed', payload: { merchantOrderId: 'ab-1' } }),
    ).toBe('ab-1');
    expect(
      phonePeOrderId({ event: 'checkout.order.completed', payload: { merchantOrderId: '../x' } }),
    ).toBeNull();
  });
});
