import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { PLANS, addMonths, computeSubscription } from '../src/billing/plans.js';
import {
  RazorpayProvider,
  parsePaymentLinkPaid,
  verifyWebhookSignature,
} from '../src/billing/provider.js';
import { applyPaid, expireDueSubscriptions } from '../src/billing/service.js';
import { signToken } from '../src/lib/jwt.js';
import { WEBHOOK_SECRET, startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  h.billing.created.length = 0;
  A = await h.tenant('+919876543210', { institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const sub = async (t: Tenant) => (await t.call('GET', '/subscription')).body;
const order = async (t: Tenant, planId = 'starter') => {
  const r = await t.call('POST', '/billing/links', { planId });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { orderId: string; url: string; amountPaise: number };
};
const linkIdOf = async (orderId: string) => {
  await h.db.pool.query("UPDATE billing_orders SET provider = 'razorpay' WHERE id = ?", [orderId]); // the webhook settles only razorpay orders
  const [rows] = (await h.db.pool.query('SELECT link_id FROM billing_orders WHERE id = ?', [
    orderId,
  ])) as unknown as [{ link_id: string }[]];
  return rows[0]!.link_id;
};
const paidBody = (
  linkId: string,
  paymentId: string,
  amount: number,
  notes: Record<string, string> = {},
) =>
  JSON.stringify({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { id: linkId, amount_paid: amount, notes } },
      payment: { entity: { id: paymentId } },
    },
  });
const sign = (raw: string, secret = WEBHOOK_SECRET) =>
  createHmac('sha256', secret).update(raw).digest('hex');
const hook = (raw: string, signature: string | null = sign(raw)) =>
  h.app.inject({
    method: 'POST',
    url: '/billing/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-razorpay-signature': signature } : {}),
    },
    payload: raw,
  });
const days = (n: number) => n * 86_400_000;

describe('plan catalogue and pure rules', () => {
  it('addMonths clamps to the end of a shorter month', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe(
      '2026-02-28',
    );
    expect(addMonths(new Date('2024-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe(
      '2024-02-29',
    );
    expect(addMonths(new Date('2026-10-08T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe(
      '2027-10-08',
    );
  });
  it('renewing while active adds on top of the remaining time; expired starts from now', () => {
    const now = new Date('2026-10-08T00:00:00Z');
    expect(
      computeSubscription(
        { status: 'active', expiresAt: new Date('2026-11-08T00:00:00Z') },
        'starter',
        now,
      )
        .expiresAt.toISOString()
        .slice(0, 10),
    ).toBe('2027-02-08');
    expect(
      computeSubscription(
        { status: 'active', expiresAt: new Date('2026-10-01T00:00:00Z') },
        'starter',
        now,
      )
        .expiresAt.toISOString()
        .slice(0, 10),
    ).toBe('2027-01-08');
    expect(computeSubscription(undefined, 'pro', now)).toMatchObject({
      studentLimit: null,
      batchLimit: null,
    });
  });
  it('lists the plans for any signed-in member', async () => {
    const r = await A.call('GET', '/billing/plans');
    expect(r.body.plans.map((p: { id: string }) => p.id)).toEqual(['starter', 'standard', 'pro']);
    expect(r.body.plans[0]).toMatchObject({ pricePaise: 39900, months: 3 });
  });
});

describe('payment links', () => {
  it('creates a link for the owner and remembers the order', async () => {
    const o = await order(A, 'standard');
    expect(o).toMatchObject({ amountPaise: 69900, url: expect.stringMatching(/^mock:\/\/pay\//) });
    expect(h.billing.created[0]).toMatchObject({
      amountPaise: 69900,
      referenceId: o.orderId,
      customerPhone: '+919876543210',
    });
    const [[row]] = (await h.db.pool.query(
      'SELECT institute_id, plan_id, amount FROM billing_orders WHERE id = ?',
      [o.orderId],
    )) as unknown as [[{ institute_id: string; plan_id: string; amount: number }]];
    expect([row.institute_id, row.plan_id, Number(row.amount)]).toEqual([
      A.instituteId,
      'standard',
      69900,
    ]);
  });

  it('the price comes from the server, never from the request', async () => {
    const r = await A.call('POST', '/billing/links', {
      planId: 'pro',
      amount: 1,
      amountPaise: 1,
      price: 1,
    });
    expect(r.body.amountPaise).toBe(99900);
  });

  it('rejects unknown plans, including prototype names', async () => {
    for (const planId of ['gold', 'constructor', '__proto__', '', 5])
      expect((await A.call('POST', '/billing/links', { planId })).status).toBe(400);
    expect((await A.call('POST', '/billing/links', {})).status).toBe(400);
  });

  it('staff cannot buy or see billing; no token gets 401', async () => {
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    expect((await staff.call('POST', '/billing/links', { planId: 'starter' })).status).toBe(403);
    expect((await staff.call('GET', '/billing')).status).toBe(403);
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: '/billing/links',
          payload: { planId: 'starter' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('a provider failure is a clean 502 and leaves no order', async () => {
    const original = h.billing.createPaymentLink.bind(h.billing);
    h.billing.createPaymentLink = async () => {
      throw new Error('razorpay-500 secret detail');
    };
    const r = await A.call('POST', '/billing/links', { planId: 'starter' });
    h.billing.createPaymentLink = original;
    expect([r.status, r.body]).toEqual([502, { error: 'payment_provider_error' }]);
    const [[n]] = (await h.db.pool.query(
      'SELECT COUNT(*) AS n FROM billing_orders',
    )) as unknown as [[{ n: number }]];
    expect(Number(n.n)).toBe(0);
  });

  it('answers 503 when no payment provider is configured', async () => {
    const bare = await buildApp({
      config: (await import('./db.js')).testConfig({ ...h.db.config }),
      pool: h.db.pool,
      billing: null,
      clock: () => h.clock.now,
    });
    const r = await bare.inject({
      method: 'POST',
      url: '/billing/links',
      headers: { authorization: `Bearer ${A.token}` },
      payload: { planId: 'starter' },
    });
    await bare.close();
    expect([r.statusCode, r.json().error]).toEqual([503, 'billing_unavailable']);
  });

  it('works while the plan is expired (that is exactly when people buy)', async () => {
    h.clock.now = new Date(h.clock.now.getTime() + days(8));
    const token = signToken(
      A.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const r = await h.app.inject({
      method: 'POST',
      url: '/billing/links',
      headers: { authorization: `Bearer ${token}` },
      payload: { planId: 'starter' },
    });
    expect(r.statusCode).toBe(201);
  });
});

describe('the mock payment (local try-out)', () => {
  it('buying an expired plan makes it active with the new limits, and history shows it', async () => {
    h.clock.now = new Date(h.clock.now.getTime() + days(8));
    const token = signToken(
      A.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const call = async (m: 'GET' | 'POST', u: string, p?: unknown) => {
      const r = await h.app.inject({
        method: m,
        url: u,
        headers: { authorization: `Bearer ${token}` },
        ...(p ? { payload: p as object } : {}),
      });
      return { status: r.statusCode, body: r.json() };
    };
    expect((await call('GET', '/subscription')).body.active).toBe(false);
    const o = (await call('POST', '/billing/links', { planId: 'starter' })).body;
    expect((await call('POST', '/billing/mock/complete', { orderId: o.orderId })).body.result).toBe(
      'applied',
    );
    const s = (await call('GET', '/subscription')).body;
    expect(s).toMatchObject({
      plan: 'starter',
      status: 'active',
      active: true,
      studentLimit: 50,
      batchLimit: 3,
    });
    expect(s.expiresAt.slice(0, 10)).toBe('2027-01-16'); // 8 Oct + 8 days + 3 months
    expect((await call('GET', '/billing')).body.history).toMatchObject([
      { planId: 'starter', amountPaise: 39900, provider: 'mock' },
    ]);
    expect(
      (await call('POST', '/students', { name: 'Back In', parentPhone: '9876543210' })).status,
    ).toBe(201); // writes work again
  });

  it('completing twice applies once', async () => {
    const o = await order(A);
    expect(
      (await A.call('POST', '/billing/mock/complete', { orderId: o.orderId })).body.result,
    ).toBe('applied');
    const after = await sub(A);
    expect(
      (await A.call('POST', '/billing/mock/complete', { orderId: o.orderId })).body.result,
    ).toBe('duplicate');
    expect((await sub(A)).expiresAt).toBe(after.expiresAt);
  });

  it("B cannot complete A's order", async () => {
    const o = await order(A);
    expect((await B.call('POST', '/billing/mock/complete', { orderId: o.orderId })).status).toBe(
      404,
    );
    expect((await sub(A)).plan).toBe('trial');
  });
});

describe('razorpay webhook', () => {
  it('a correctly signed payment applies the plan the ORDER names', async () => {
    const o = await order(A, 'pro');
    const raw = paidBody(await linkIdOf(o.orderId), 'pay_1', 99900);
    const r = await hook(raw);
    expect([r.statusCode, r.json()]).toEqual([200, { ok: true, result: 'applied' }]);
    expect(await sub(A)).toMatchObject({ plan: 'pro', status: 'active', studentLimit: null });
    expect((await A.call('GET', '/billing')).body.history[0]).toMatchObject({
      paymentId: 'pay_1',
      provider: 'razorpay',
      planId: 'pro',
    });
  });

  it('rejects a missing, wrong or tampered signature and changes nothing', async () => {
    const o = await order(A, 'pro');
    const raw = paidBody(await linkIdOf(o.orderId), 'pay_1', 99900);
    for (const sig of [
      null, // no signature header at all
      '',
      'abc',
      sign(raw, 'wrong-secret-0123456789'),
      sign(raw).toUpperCase(),
      sign(raw).slice(0, -1),
    ]) {
      const r = await hook(raw, sig);
      expect([sig, r.statusCode]).toEqual([sig, 401]);
    }
    expect((await hook(raw.replace('99900', '10'), sign(raw))).statusCode).toBe(401); // body changed after signing
    expect((await sub(A)).plan).toBe('trial');
  });

  it('a repeated delivery is applied once (Razorpay retries)', async () => {
    const o = await order(A);
    const raw = paidBody(await linkIdOf(o.orderId), 'pay_1', 39900);
    const results = await Promise.all(Array.from({ length: 5 }, () => hook(raw)));
    expect(results.map((r) => r.json().result ?? r.body).sort()).toEqual([
      'applied',
      'duplicate',
      'duplicate',
      'duplicate',
      'duplicate',
    ]);
    const s = await sub(A);
    expect(s.expiresAt.slice(0, 10)).toBe('2027-01-15'); // 3 months on top of the 7 trial days left, not 15 months
    const [[n]] = (await h.db.pool.query(
      "SELECT COUNT(*) AS n FROM billing_events WHERE status = 'applied'",
    )) as unknown as [[{ n: number }]];
    expect(Number(n.n)).toBe(1);
  });

  it('a wrong amount or an unknown link is recorded as rejected and gives nothing', async () => {
    const o = await order(A, 'pro');
    const link = await linkIdOf(o.orderId);
    expect((await hook(paidBody(link, 'pay_cheap', 100))).json().result).toBe('invalid');
    expect((await hook(paidBody('plink_never_issued', 'pay_ghost', 99900))).json().result).toBe(
      'invalid',
    );
    expect((await sub(A)).plan).toBe('trial');
    const [rows] = (await h.db.pool.query(
      'SELECT payment_id, reason FROM billing_events ORDER BY payment_id',
    )) as unknown as [{ payment_id: string; reason: string }[]];
    expect(rows).toEqual([
      { payment_id: 'pay_cheap', reason: 'amount_mismatch' },
      { payment_id: 'pay_ghost', reason: 'unknown_link' },
    ]);
  });

  it('notes in the webhook cannot redirect the plan to another institute or plan', async () => {
    const o = await order(A, 'starter');
    const raw = paidBody(await linkIdOf(o.orderId), 'pay_1', 39900, {
      instituteId: B.instituteId,
      planId: 'pro',
    });
    expect((await hook(raw)).json().result).toBe('applied');
    expect((await sub(A)).plan).toBe('starter');
    expect((await sub(B)).plan).toBe('trial');
  });

  it('other events and malformed bodies are handled calmly', async () => {
    const other = JSON.stringify({ event: 'payment.authorized', payload: {} });
    expect((await hook(other)).json()).toEqual({ ok: true, ignored: true });
    expect((await hook('{not json')).statusCode).toBe(400);
    expect(
      (await hook(JSON.stringify({ event: 'payment_link.paid', payload: {} }))).json().ignored,
    ).toBe(true);
    expect((await hook(paidBody('x'.repeat(100), 'pay_1', 5))).json().ignored).toBe(true);
  });

  it('is unavailable without a configured secret', async () => {
    const bare = await buildApp({
      config: (await import('./db.js')).testConfig({ ...h.db.config }),
      pool: h.db.pool,
      clock: () => h.clock.now,
    });
    const raw = '{}';
    const r = await bare.inject({
      method: 'POST',
      url: '/billing/webhooks/razorpay',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw) },
      payload: raw,
    });
    await bare.close();
    expect(r.statusCode).toBe(503);
  });

  it('renewing early stacks months on the remaining time', async () => {
    const o1 = await order(A, 'starter');
    await hook(paidBody(await linkIdOf(o1.orderId), 'pay_1', 39900));
    const o2 = await order(A, 'starter');
    await hook(paidBody(await linkIdOf(o2.orderId), 'pay_2', 39900));
    expect((await sub(A)).expiresAt.slice(0, 10)).toBe('2027-04-15'); // two purchases = 6 months on top of the trial days left
  });
});

describe('expiry job and the provider client', () => {
  it('marks only subscriptions that have ended', async () => {
    await h.db.pool.query(
      "UPDATE subscriptions SET plan = 'starter', expires_at = '2026-10-01 00:00:00' WHERE institute_id = ?",
      [A.instituteId],
    );
    expect(await expireDueSubscriptions(h.db.pool, h.clock.now)).toBe(1);
    expect((await sub(A)).status).toBe('expired');
    expect((await sub(B)).status).toBe('active');
    expect(await expireDueSubscriptions(h.db.pool, h.clock.now)).toBe(0);
  });

  it('an order made by the mock provider can never be settled as a razorpay payment', async () => {
    const o = await order(A);
    const [rows] = (await h.db.pool.query('SELECT link_id FROM billing_orders WHERE id = ?', [
      o.orderId,
    ])) as unknown as [{ link_id: string }[]];
    const paid = {
      paymentId: 'pay_x',
      linkId: rows[0]!.link_id,
      amountPaise: PLANS.starter.pricePaise,
    };
    expect(await applyPaid(h.db.pool, 'razorpay', paid, h.clock.now)).toBe('invalid');
    expect((await sub(A)).plan).toBe('trial');
  });

  it('RazorpayProvider sends the documented request and never leaks the secret in errors', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = new RazorpayProvider('rzp_key', 'rzp_secret', (async (
      url: string,
      init: RequestInit,
    ) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'plink_1', short_url: 'https://rzp.io/i/abc' }), {
        status: 200,
      });
    }) as unknown as typeof fetch);
    expect(
      await ok.createPaymentLink({
        amountPaise: 39900,
        description: 'd',
        referenceId: 'ref',
        customerPhone: '+919876543210',
      }),
    ).toEqual({ id: 'plink_1', url: 'https://rzp.io/i/abc' });
    expect(calls[0]!.url).toBe('https://api.razorpay.com/v1/payment_links');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('rzp_key:rzp_secret').toString('base64')}`,
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({
      amount: 39900,
      currency: 'INR',
      reference_id: 'ref',
      accept_partial: false,
      notify: { sms: false, email: false },
    });
    const bad = new RazorpayProvider(
      'k',
      's',
      (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch,
    );
    await expect(
      bad.createPaymentLink({ amountPaise: 1, description: 'd', referenceId: 'r' }),
    ).rejects.toThrow('razorpay-401');
    const empty = new RazorpayProvider(
      'k',
      's',
      (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch,
    );
    await expect(
      empty.createPaymentLink({ amountPaise: 1, description: 'd', referenceId: 'r' }),
    ).rejects.toThrow('razorpay-bad-response');
  });

  it('signature and body parsing helpers', () => {
    expect(verifyWebhookSignature('x', sign('x'), WEBHOOK_SECRET)).toBe(true);
    expect(verifyWebhookSignature('x', undefined, WEBHOOK_SECRET)).toBe(false);
    expect(verifyWebhookSignature('x', sign('x'), '')).toBe(false);
    expect(
      parsePaymentLinkPaid({
        event: 'payment_link.paid',
        payload: { payment_link: { entity: { id: 'l', amount_paise: 1 } } },
      }),
    ).toBeNull();
    expect(parsePaymentLinkPaid(null)).toBeNull();
  });
});
