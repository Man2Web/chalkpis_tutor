import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { payToken } from '../src/billing/payLink.js';
import { addMonths } from '../src/billing/plans.js';
import { reconcileWebSubscriptions } from '../src/billing/webSubscriptions.js';
import { queuePlanReminders } from '../src/messaging/centreMessages.js';
import { WEBHOOK_SECRET, startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;
const DAY = 86_400_000;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  h.billing.plans.length = 0;
  h.billing.subscriptions.clear();
  h.billing.invoices.clear();
  h.billing.cancelled.length = 0;
  A = await h.tenant('+919876543210', { tutor: 'Kiran', institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const trialEnd = () => new Date(h.clock.now.getTime() + 7 * DAY);
const start = (t: Tenant, planId: string, cycle: string) =>
  t.call('POST', '/billing/subscriptions', { planId, cycle });
const hook = (body: unknown, signed = true) => {
  const raw = JSON.stringify(body);
  return h.app.inject({
    method: 'POST',
    url: '/billing/webhooks/razorpay',
    headers: {
      'content-type': 'application/json',
      ...(signed
        ? { 'x-razorpay-signature': createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex') }
        : {}),
    },
    payload: raw,
  });
};
const subEvent = (
  event: string,
  id: string,
  status: string,
  payment?: { id: string; amount: number },
) => ({
  event: `subscription.${event}`,
  payload: {
    subscription: {
      entity: {
        id,
        plan_id: 'plan_x',
        status,
        current_end: Math.floor((h.clock.now.getTime() + 30 * DAY) / 1000),
        charge_at: Math.floor((h.clock.now.getTime() + 30 * DAY) / 1000),
      },
    },
    ...(payment
      ? { payment: { entity: { id: payment.id, amount: payment.amount, status: 'captured' } } }
      : {}),
  },
});
const plan = async (t: Tenant) => (await t.call('GET', '/subscription')).body;
/** Approves and charges a subscription, as Razorpay would. */
const approveAndCharge = async (id: string, paymentId: string, amount: number) => {
  await hook(subEvent('authenticated', id, 'authenticated'));
  return (await hook(subEvent('charged', id, 'active', { id: paymentId, amount }))).json();
};

describe('website auto-renew (Razorpay Subscriptions)', () => {
  it('starts at the end of the trial; the Razorpay plan is made once and reused', async () => {
    const r = await start(A, 'standard', 'year');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      url: expect.stringMatching(/^https:\/\/rzp\.io\/mock\/sub_/),
      startAt: trialEnd().toISOString(),
      amountPaise: 299900,
    });
    const sent = h.billing.subscriptions.get(r.body.id)!.request;
    expect(sent).toMatchObject({
      totalCount: 10,
      startAt: Math.floor(trialEnd().getTime() / 1000),
      notes: { institute_id: A.instituteId, plan: 'standard', cycle: 'year' },
    });
    // a double tap gives the same approval page; another centre reuses the same Razorpay plan
    expect((await start(A, 'standard', 'year')).body.id).toBe(r.body.id);
    expect((await start(B, 'standard', 'year')).body.id).not.toBe(r.body.id);
    expect(h.billing.plans).toEqual([
      { period: 'yearly', amountPaise: 299900, name: 'Chalkpis Standard (yearly)' },
    ]);
    expect((await start(A, 'pro', 'week')).status).toBe(400);
    // not approved yet: it does not renew anything
    expect((await plan(A)).autoRenew).toBeNull();
  });

  it('approval turns it on; each charge extends the plan once, at our price only', async () => {
    const id = (await start(A, 'standard', 'year')).body.id;
    await hook(subEvent('authenticated', id, 'authenticated'));
    expect((await plan(A)).autoRenew).toMatchObject({
      via: 'website',
      status: 'authenticated',
      plan: 'standard',
      cycle: 'year',
      amountPaise: 299900,
    });
    const charged = await hook(subEvent('charged', id, 'active', { id: 'pay_1', amount: 299900 }));
    expect(charged.json()).toEqual({ ok: true, result: 'applied' });
    const s = await plan(A);
    expect(s).toMatchObject({ plan: 'standard', cycle: 'year', studentLimit: 100 });
    expect(s.expiresAt).toBe(addMonths(trialEnd(), 12).toISOString()); // after the trial, no days lost
    expect(
      (await hook(subEvent('charged', id, 'active', { id: 'pay_1', amount: 299900 }))).json()
        .result,
    ).toBe('duplicate');
    expect(
      (await hook(subEvent('charged', id, 'active', { id: 'pay_cheap', amount: 100 }))).json()
        .result,
    ).toBe('invalid');
    const [rows] = (await h.db.pool.query(
      'SELECT payment_id, subscription_id, status, reason, note FROM billing_events ORDER BY payment_id',
    )) as unknown as [Record<string, unknown>[]];
    expect(rows).toEqual([
      {
        payment_id: 'pay_1',
        subscription_id: id,
        status: 'applied',
        reason: null,
        note: 'Auto-renew',
      },
      {
        payment_id: 'pay_cheap',
        subscription_id: id,
        status: 'rejected',
        reason: 'amount_mismatch',
        note: null,
      },
    ]);
    // while it renews: no one-time payment, no "plan ending" reminders
    const once = await A.call('POST', '/billing/links', { planId: 'pro', cycle: 'year' });
    expect([once.status, once.body.error]).toEqual([409, 'auto_renew_on']);
    await h.db.pool.query('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [
      new Date(h.clock.now.getTime() + DAY),
      A.instituteId,
    ]);
    await h.db.pool.query('DELETE FROM centre_messages');
    const links = { baseUrl: 'https://tutor.chalkpis.com', secret: 'x'.repeat(32) };
    expect(await queuePlanReminders(h.db.pool, h.clock.now, links)).toBe(0);
  });

  it('turning it off: before any charge it stops at once, after one at the end of the paid cycle', async () => {
    const first = (await start(A, 'starter', 'month')).body.id;
    await hook(subEvent('authenticated', first, 'authenticated'));
    expect((await A.call('POST', '/billing/subscriptions/cancel')).body).toEqual({ stopped: true });
    expect(h.billing.cancelled).toEqual([{ id: first, atCycleEnd: false }]);

    const second = (await start(A, 'starter', 'month')).body.id;
    await approveAndCharge(second, 'pay_2', 19900);
    expect((await A.call('POST', '/billing/subscriptions/cancel')).body).toEqual({ stopped: true });
    expect(h.billing.cancelled.at(-1)).toEqual({ id: second, atCycleEnd: true });
    expect((await plan(A)).autoRenew).toBeNull();
    expect((await A.call('POST', '/billing/subscriptions/cancel')).body).toEqual({
      stopped: false,
    });
    // a one-time payment is possible again
    expect(
      (await A.call('POST', '/billing/links', { planId: 'starter', cycle: 'year' })).status,
    ).toBe(201);
  });

  it('an upgrade is charged now and replaces the old one (days credited); a downgrade waits for renewal', async () => {
    const std = (await start(A, 'standard', 'month')).body.id;
    await approveAndCharge(std, 'pay_s', 29900);
    expect((await start(A, 'standard', 'month')).body.error).toBe('already_renewing');
    const down = await start(A, 'starter', 'month');
    expect([down.status, down.body.error]).toEqual([409, 'downgrade_at_renewal']);

    const up = await start(A, 'pro', 'year');
    expect(up.body.startAt).toBeNull(); // an upgrade starts now
    expect(h.billing.subscriptions.get(up.body.id)!.request.startAt).toBeUndefined();
    await approveAndCharge(up.body.id, 'pay_p', 499900);
    expect(h.billing.cancelled).toEqual([{ id: std, atCycleEnd: false }]);
    const s = await plan(A);
    expect([s.plan, s.cycle, s.autoRenew.plan]).toEqual(['pro', 'year', 'pro']);
    // the Standard month left was credited on top of the year
    expect(Date.parse(s.expiresAt)).toBeGreaterThan(addMonths(h.clock.now, 12).getTime());
  });

  it('a payment that finally fails (halted) stops renewing; a store subscription blocks the website', async () => {
    const id = (await start(A, 'standard', 'year')).body.id;
    await approveAndCharge(id, 'pay_1', 299900);
    await hook(subEvent('pending', id, 'pending'));
    expect((await plan(A)).autoRenew.status).toBe('pending'); // still being retried
    await hook(subEvent('halted', id, 'halted'));
    expect((await plan(A)).autoRenew).toBeNull();

    await h.db.pool.query(
      "UPDATE subscriptions SET store = 'app_store', store_will_renew = 1 WHERE institute_id = ?",
      [B.instituteId],
    );
    expect((await start(B, 'pro', 'year')).body.error).toBe('store_managed');
  });

  it('a charge whose webhook was missed is picked up; approval pages nobody used expire', async () => {
    const id = (await start(A, 'starter', 'year')).body.id;
    const gw = h.billing.subscriptions.get(id)!;
    gw.status = 'active';
    gw.chargeAt = null;
    h.billing.invoices.set(id, [
      { status: 'paid', paymentId: 'pay_missed', amountPaise: 199900 },
      { status: 'issued', paymentId: null, amountPaise: 199900 },
    ]);
    expect(await reconcileWebSubscriptions(h.db.pool, h.billing, h.clock.now)).toBe(1);
    expect(await reconcileWebSubscriptions(h.db.pool, h.billing, h.clock.now)).toBe(0);
    expect(await plan(A)).toMatchObject({ plan: 'starter', autoRenew: { status: 'active' } });

    const stale = (await start(B, 'starter', 'year')).body.id;
    expect(
      await reconcileWebSubscriptions(
        h.db.pool,
        h.billing,
        new Date(h.clock.now.getTime() + 3 * DAY),
      ),
    ).toBe(0);
    const [[row]] = (await h.db.pool.query('SELECT status FROM web_subscriptions WHERE id = ?', [
      stale,
    ])) as unknown as [[{ status: string }]];
    expect(row.status).toBe('expired');
  });

  it('webhooks need the signature; an unknown subscription changes nothing', async () => {
    expect(
      (await hook(subEvent('charged', 'sub_x', 'active', { id: 'p', amount: 1 }), false))
        .statusCode,
    ).toBe(401);
    expect(
      (
        await hook(subEvent('charged', 'sub_unknown', 'active', { id: 'p9', amount: 299900 }))
      ).json(),
    ).toEqual({
      ok: true,
      result: 'ignored',
    });
    const [rows] = (await h.db.pool.query('SELECT * FROM billing_events')) as unknown as [
      unknown[],
    ];
    expect(rows).toEqual([]);
  });

  it('the pay page offers auto-renew first, pay-once for a year only, and shows when it is on', async () => {
    const url = `/pay/${payToken(h.db.config.JWT_SECRET, A.instituteId)}`;
    const page = await h.app.inject({ method: 'GET', url });
    expect(page.body).toContain('Start yearly · ₹2,999/year');
    expect(page.body).toContain('Start monthly · ₹299/month');
    expect(page.body).toContain('or pay once for 1 year (no auto-renew)');
    expect(page.body).toContain('Plans renew automatically');
    const post = (form: string) =>
      h.app.inject({
        method: 'POST',
        url,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: form,
      });
    expect((await post('plan=pro&cycle=month&mode=once')).statusCode).toBe(400); // monthly is auto-renew only
    const go = await post('plan=standard&cycle=year&mode=subscribe');
    expect(go.statusCode).toBe(200);
    expect(go.body).toContain('Turning on auto-renew');
    expect(go.body).toContain('when your free trial ends');
    const [[w]] = (await h.db.pool.query('SELECT id FROM web_subscriptions')) as unknown as [
      [{ id: string }],
    ];
    await hook(subEvent('authenticated', w.id, 'authenticated'));
    const on = await h.app.inject({ method: 'GET', url });
    expect(on.body).toContain('auto-renew is on');
    expect(on.body).toContain('Your plan: auto-renews yearly.');
    expect(on.body).toContain('Upgrade · ₹4,999/year');
    expect(on.body).not.toContain('or pay once');
  });
});
