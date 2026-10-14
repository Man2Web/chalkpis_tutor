import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { payToken } from '../src/billing/payLink.js';
import { addMonths } from '../src/billing/plans.js';
import { expireDueSubscriptions } from '../src/billing/service.js';
import {
  RevenueCatClient,
  activeStoreSub,
  resyncEndingStoreSubscriptions,
  type RcSubscriber,
  type RcSubscription,
  type StoreClient,
} from '../src/billing/store.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const AUTH = 'rc_hook_secret_0123456789';
const DAY = 86_400_000;

/** RevenueCat as the server sees it: what each centre (app user id) has, set by the test. */
class FakeStore implements StoreClient {
  subs = new Map<string, RcSubscriber>();
  calls: string[] = [];
  down = false;
  async getSubscriber(id: string) {
    this.calls.push(id);
    if (this.down) throw new Error('revenuecat_503');
    return this.subs.get(id) ?? {};
  }
}
const store = new FakeStore();

let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness(
    {
      REVENUECAT_WEBHOOK_AUTH: AUTH,
      REVENUECAT_IOS_KEY: 'appl_public_test',
      REVENUECAT_ANDROID_KEY: 'goog_public_test',
    },
    { store },
  );
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  store.subs.clear();
  store.calls.length = 0;
  store.down = false;
  A = await h.tenant('+919876543210', { tutor: 'Kiran', institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const at = (days: number) => new Date(h.clock.now.getTime() + days * DAY).toISOString();
const sub = (
  product: string,
  days: number,
  more: Partial<RcSubscription> = {},
): Record<string, RcSubscription> => ({
  [product]: {
    store: 'app_store',
    expires_date: at(days),
    purchase_date: h.clock.now.toISOString(),
    is_sandbox: false,
    unsubscribe_detected_at: null,
    billing_issues_detected_at: null,
    refunded_at: null,
    ...more,
  },
});
const has = (t: Tenant, subscriptions: Record<string, RcSubscription>) =>
  store.subs.set(t.instituteId, { subscriptions });
const plan = async (t: Tenant) => (await t.call('GET', '/subscription')).body;
const row = async (t: Tenant) =>
  (
    (await h.db.pool.query(
      'SELECT plan, cycle, status, expires_at, store, store_will_renew, banked_plan, banked_ms FROM subscriptions WHERE institute_id = ?',
      [t.instituteId],
    )) as unknown as [
      {
        plan: string;
        cycle: string | null;
        status: string;
        expires_at: Date;
        store: string | null;
        store_will_renew: number | null;
        banked_plan: string | null;
        banked_ms: number | string | null;
      }[],
    ]
  )[0][0]!;
const hook = (body: unknown, auth: string | null = AUTH) =>
  h.app.inject({
    method: 'POST',
    url: '/billing/webhooks/revenuecat',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    payload: JSON.stringify(body),
  });
let n = 0;
const event = (t: Tenant | string, type: string, more: Record<string, unknown> = {}) => ({
  api_version: '1.0',
  event: {
    id: `evt_${++n}`,
    type,
    app_user_id: typeof t === 'string' ? t : t.instituteId,
    store: 'APP_STORE',
    environment: 'PRODUCTION',
    ...more,
  },
});
const payments = async () =>
  (
    (await h.db.pool.query(
      'SELECT payment_id, provider, plan_id, cycle, amount, net_amount, sandbox, status, note FROM billing_events ORDER BY created_at, payment_id',
    )) as unknown as [Record<string, unknown>[]]
  )[0].map((r) => ({ ...r, amount: Number(r.amount), net_amount: Number(r.net_amount) }));

describe('in-app subscriptions (App Store / Google Play through RevenueCat)', () => {
  it('the apps get the public store keys only when RevenueCat is set up', async () => {
    expect((await A.call('GET', '/billing/plans')).body.store).toEqual({
      ios: 'appl_public_test',
      android: 'goog_public_test',
    });
  });

  it('a purchase switches the plan on at once, and the trial days left wait until it ends', async () => {
    has(A, sub('chalkpis.standard.monthly', 30));
    const r = await A.call('POST', '/billing/store/sync');
    expect(r.body).toEqual({ state: 'store', plan: 'standard', expiresAt: at(30) });
    const s = await plan(A);
    expect(s).toMatchObject({
      plan: 'standard',
      cycle: 'month',
      active: true,
      studentLimit: 100,
      batchLimit: 5,
      expiresAt: at(30),
      store: {
        name: 'app_store',
        product: 'chalkpis.standard.monthly',
        willRenew: true,
        issue: null,
      },
    });
    expect(s.store.thenUntil).toBe(new Date(Date.parse(at(30)) + 7 * DAY).toISOString());
    // the owner is told once, not again when nothing changed
    await A.call('POST', '/billing/store/sync');
    const [msgs] = (await h.db.pool.query(
      "SELECT ref FROM centre_messages WHERE type = 'plan_active'",
    )) as unknown as [{ ref: string }[]];
    expect(msgs).toHaveLength(1);
    expect(store.calls).toEqual([A.instituteId, A.instituteId]);
    // another centre is never touched
    expect((await plan(B)).plan).toBe('trial');
  });

  it('the webhook is checked, reads RevenueCat again, records the payment once; a retry does nothing', async () => {
    has(A, sub('chalkpis.pro.yearly', 365));
    const body = event(A, 'INITIAL_PURCHASE', {
      product_id: 'chalkpis.pro.yearly',
      transaction_id: '2000000111',
      price_in_purchased_currency: 4999,
      currency: 'INR',
      tax_percentage: 0.1525,
      commission_percentage: 0.15,
      period_type: 'NORMAL',
      purchased_at_ms: h.clock.now.getTime(),
      expiration_at_ms: Date.parse(at(365)),
    });
    expect((await hook(body, null)).statusCode).toBe(401);
    expect((await hook(body, 'wrong_secret_0123456789x')).statusCode).toBe(401);
    expect((await plan(A)).plan).toBe('trial');
    expect((await hook('{nope')).statusCode).toBe(400);

    expect((await hook(body)).json()).toEqual({ ok: true, result: 'handled' });
    expect(await plan(A)).toMatchObject({ plan: 'pro', cycle: 'year', studentLimit: null });
    expect((await hook(body)).json().result).toBe('duplicate');
    expect(await payments()).toEqual([
      {
        payment_id: 'apple_2000000111',
        provider: 'apple',
        plan_id: 'pro',
        cycle: 'year',
        amount: 499900,
        net_amount: Math.round(499900 * (1 - 0.1525) * (1 - 0.15)),
        sandbox: 0,
        status: 'applied',
        note: null,
      },
    ]);
    expect((await A.call('GET', '/billing')).body.history[0]).toMatchObject({
      provider: 'apple',
      planId: 'pro',
      cycle: 'year',
      amountPaise: 499900,
    });
  });

  it('a ₹49 first month is recorded at what was paid', async () => {
    has(A, sub('chalkpis.standard.monthly', 30));
    await hook(
      event(A, 'INITIAL_PURCHASE', {
        product_id: 'chalkpis.standard.monthly',
        transaction_id: 'GPA.1111',
        store: 'PLAY_STORE',
        price_in_purchased_currency: 49,
        currency: 'INR',
        period_type: 'INTRO',
      }),
    );
    expect(await payments()).toMatchObject([
      { payment_id: 'google_GPA.1111', provider: 'google', amount: 4900, note: 'Intro price' },
    ]);
  });

  it('while it renews by itself the website sells nothing; renewal moves the end; after a cancel the website may sell, after it', async () => {
    has(A, sub('chalkpis.starter.monthly', 30));
    await A.call('POST', '/billing/store/sync');
    const refused = await A.call('POST', '/billing/links', { planId: 'starter', cycle: 'month' });
    expect([refused.status, refused.body.error]).toEqual([409, 'store_managed']);
    const page = await h.app.inject({
      method: 'GET',
      url: `/pay/${payToken(h.db.config.JWT_SECRET, A.instituteId)}`,
    });
    expect(page.body).toContain('renewing automatically through the App Store');
    expect(page.body).not.toContain('<form method="post"');

    has(A, sub('chalkpis.starter.monthly', 60));
    await hook(event(A, 'RENEWAL', { product_id: 'chalkpis.starter.monthly' }));
    expect((await plan(A)).expiresAt).toBe(at(60));

    has(
      A,
      sub('chalkpis.starter.monthly', 60, { unsubscribe_detected_at: h.clock.now.toISOString() }),
    );
    await hook(event(A, 'CANCELLATION', { cancel_reason: 'UNSUBSCRIBE' }));
    expect(await plan(A)).toMatchObject({
      plan: 'starter',
      active: true,
      store: { willRenew: false },
    });
    // a website month bought now is added to the days that come after the store subscription
    const o = await A.call('POST', '/billing/links', { planId: 'starter', cycle: 'month' });
    expect(o.status).toBe(201);
    await A.call('POST', '/billing/mock/complete', { orderId: o.body.orderId });
    const s = await plan(A);
    expect(s.expiresAt).toBe(at(60)); // the store still decides until then
    const banked = addMonths(new Date(Date.parse(at(7))), 1).getTime() - h.clock.now.getTime();
    expect(Date.parse(s.store.thenUntil)).toBe(Date.parse(at(60)) + banked);
  });

  it('when the store subscription ends the banked days resume; with none, the plan ends', async () => {
    has(A, sub('chalkpis.standard.monthly', 30));
    has(B, sub('chalkpis.standard.monthly', 30));
    await A.call('POST', '/billing/store/sync');
    await B.call('POST', '/billing/store/sync');
    await h.db.pool.query('UPDATE subscriptions SET banked_ms = NULL WHERE institute_id = ?', [
      B.instituteId,
    ]);
    has(A, sub('chalkpis.standard.monthly', -1));
    has(B, sub('chalkpis.standard.monthly', -1));
    await hook(event(A, 'EXPIRATION'));
    await hook(event(B, 'EXPIRATION'));
    expect(await row(A)).toMatchObject({ plan: 'trial', status: 'active', store: null });
    expect((await row(A)).expires_at.toISOString()).toBe(at(7));
    expect(await row(B)).toMatchObject({ plan: 'standard', status: 'expired', store: null });
    expect((await plan(B)).active).toBe(false);
  });

  it('a refund ends it at once and marks its payment refunded (and back, if reversed)', async () => {
    has(A, sub('chalkpis.pro.monthly', 30));
    const paid = {
      product_id: 'chalkpis.pro.monthly',
      transaction_id: 't1',
      price_in_purchased_currency: 499,
    };
    await hook(event(A, 'INITIAL_PURCHASE', paid));
    has(A, sub('chalkpis.pro.monthly', 30, { refunded_at: h.clock.now.toISOString() }));
    await hook(event(A, 'CANCELLATION', { ...paid, cancel_reason: 'CUSTOMER_SUPPORT' }));
    expect((await payments())[0]).toMatchObject({ payment_id: 'apple_t1', status: 'refunded' });
    expect(await row(A)).toMatchObject({ plan: 'trial', store: null }); // back to the trial days
    await hook(event(A, 'REFUND_REVERSED', paid));
    expect((await payments())[0]).toMatchObject({ status: 'applied' });
  });

  it('a subscription moved to another centre (restored there) moves the plan with it', async () => {
    has(A, sub('chalkpis.pro.yearly', 365));
    await A.call('POST', '/billing/store/sync');
    store.subs.delete(A.instituteId);
    has(B, sub('chalkpis.pro.yearly', 365));
    await hook(
      event(B, 'TRANSFER', { transferred_from: [A.instituteId], transferred_to: [B.instituteId] }),
    );
    expect((await plan(A)).plan).toBe('trial');
    expect((await plan(B)).plan).toBe('pro');
  });

  it('sandbox purchases (App Review, testers) switch the plan on but are not revenue', async () => {
    has(A, sub('chalkpis.standard.monthly', 30, { is_sandbox: true }));
    await hook(
      event(A, 'INITIAL_PURCHASE', {
        environment: 'SANDBOX',
        product_id: 'chalkpis.standard.monthly',
        transaction_id: 'sb1',
        price_in_purchased_currency: 299,
      }),
    );
    expect((await plan(A)).plan).toBe('standard');
    const admin = await h.admin();
    const b = (await admin.call('GET', '/admin/api/billing')).body;
    expect(b.summary).toMatchObject({ revenueAllTime: 0, paying: 0, mrr: 0 });
    expect(b.payments[0]).toMatchObject({ provider: 'apple', test: true, status: 'paid' });
  });

  it('events for unknown or anonymous users change nothing', async () => {
    for (const id of ['$RCAnonymousID:abc', '00000000-0000-4000-8000-000000000000', ''])
      expect((await hook(event(id, 'INITIAL_PURCHASE'))).json().result).toBe('ignored');
    expect(await payments()).toEqual([]);
  });

  it('a webhook that cannot read RevenueCat fails, so RevenueCat sends it again later', async () => {
    store.down = true;
    const body = event(A, 'INITIAL_PURCHASE');
    expect((await hook(body)).statusCode).toBe(500);
    store.down = false;
    has(A, sub('chalkpis.starter.yearly', 365));
    expect((await hook(body)).json().result).toBe('handled');
    expect((await plan(A)).plan).toBe('starter');
  });

  it('a missed webhook: the resync job reads RevenueCat, and the expiry job hands back banked days on its own', async () => {
    has(A, sub('chalkpis.starter.monthly', 1));
    await A.call('POST', '/billing/store/sync');
    has(A, sub('chalkpis.starter.monthly', 31)); // renewed; the webhook was lost
    expect(await resyncEndingStoreSubscriptions(h.db.pool, store, h.clock.now)).toBe(1);
    expect((await row(A)).expires_at.toISOString()).toBe(at(31));

    store.down = true;
    const later = new Date(Date.parse(at(32)));
    expect(await resyncEndingStoreSubscriptions(h.db.pool, store, later)).toBe(0);
    await expireDueSubscriptions(h.db.pool, later);
    const r = await row(A);
    expect(r).toMatchObject({ plan: 'trial', status: 'active', store: null, banked_ms: null });
    expect(r.expires_at.getTime()).toBe(later.getTime() + 7 * DAY);
  });

  it('admin: extra days go after the store subscription; an exact edit is refused', async () => {
    has(A, sub('chalkpis.standard.monthly', 30));
    await A.call('POST', '/billing/store/sync');
    const admin = await h.admin();
    const r = await admin.call('POST', `/admin/api/institutes/${A.instituteId}/plan`, {
      plan: 'pro',
      days: 10,
    });
    expect(r.body.afterStore).toBe(true);
    expect(await row(A)).toMatchObject({ plan: 'standard', banked_plan: 'pro' });
    expect(Number((await row(A)).banked_ms)).toBe(17 * DAY);
    const edit = await admin.call('PUT', `/admin/api/institutes/${A.instituteId}/subscription`, {
      plan: 'pro',
      status: 'active',
      endsOn: '2027-01-01',
      studentLimit: null,
      batchLimit: null,
    });
    expect([edit.status, edit.body.error]).toEqual([409, 'store_managed']);
  });

  it('announcement buttons cannot point to the pay pages', async () => {
    const admin = await h.admin();
    for (const link of [
      'https://tutor.chalkpis.com/pay/abc',
      'https://tutor.chalkpis.com/plan',
      'https://tutor.chalkpis.com/plan?centre=1',
    ])
      expect(
        (await admin.call('POST', '/admin/api/announcements', { title: 'Renew now', link })).status,
      ).toBe(400);
    expect(
      (
        await admin.call('POST', '/admin/api/announcements', {
          title: 'Read the guide',
          link: 'https://chalkpis.com/planning-guide',
        })
      ).status,
    ).toBeLessThan(300);
  });
});

describe('reading RevenueCat', () => {
  it('the active subscription: ours only, not refunded, a grace period counts, the higher plan wins', () => {
    const now = new Date('2026-10-08T06:00:00Z');
    const iso = (d: number) => new Date(now.getTime() + d * DAY).toISOString();
    const base = { store: 'app_store', expires_date: iso(10) } satisfies RcSubscription;
    expect(
      activeStoreSub(
        {
          subscriptions: {
            'chalkpis.starter.monthly': base,
            'chalkpis.pro': {
              store: 'play_store',
              product_plan_identifier: 'yearly',
              expires_date: iso(300),
            },
            'chalkpis.standard.monthly': { ...base, store: 'stripe' },
            'other.app.pro': { ...base, expires_date: iso(900) },
          },
        },
        now,
      ),
    ).toMatchObject({ store: 'play_store', product: 'chalkpis.pro:yearly', plan: 'pro' });
    expect(
      activeStoreSub(
        {
          subscriptions: {
            'chalkpis.standard.yearly': {
              ...base,
              expires_date: iso(-1),
              grace_period_expires_date: iso(5),
              billing_issues_detected_at: iso(-1),
            },
          },
        },
        now,
      ),
    ).toMatchObject({ plan: 'standard', issue: 'billing', willRenew: true });
    expect(
      activeStoreSub(
        { subscriptions: { 'chalkpis.pro.yearly': { ...base, refunded_at: iso(-1) } } },
        now,
      ),
    ).toBeNull();
    expect(activeStoreSub({}, now)).toBeNull();
  });

  it('RevenueCatClient asks with the secret key and never puts it in an error', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = new RevenueCatClient('sk_secret', (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ subscriber: { subscriptions: {} } }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(await ok.getSubscriber('a b')).toEqual({ subscriptions: {} });
    expect(calls[0]!.url).toBe('https://api.revenuecat.com/v1/subscribers/a%20b');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk_secret',
    );
    const bad = new RevenueCatClient(
      'sk_secret',
      (async () => new Response('no', { status: 401 })) as unknown as typeof fetch,
    );
    await expect(bad.getSubscriber('x')).rejects.toThrow('revenuecat_401');
    await expect(bad.getSubscriber('x')).rejects.not.toThrow(/sk_secret/);
  });
});

describe('investor numbers', () => {
  it('conversion by sign-up month, last month churn, revenue by source', async () => {
    const o = await A.call('POST', '/billing/links', { planId: 'standard', cycle: 'year' });
    await A.call('POST', '/billing/mock/complete', { orderId: o.body.orderId });
    // B paid for August to September and did not renew
    await h.db.pool.query(
      "INSERT INTO billing_events (payment_id, provider, institute_id, plan_id, cycle, amount, status, expires_at, created_at) VALUES ('old_1', 'razorpay', ?, 'starter', 'month', 19900, 'applied', '2026-09-20', '2026-08-20')",
      [B.instituteId],
    );
    const admin = await h.admin();
    const b = (await admin.call('GET', '/admin/api/billing')).body;
    expect(b.summary).toMatchObject({
      paying: 1,
      mrr: Math.round(299900 / 12),
      arpu: Math.round(299900 / 12),
      churnLastMonth: { paying: 1, churned: 1, rate: 1 },
    });
    expect(b.conversion).toEqual([{ month: '2026-10', signups: 2, paid: 2 }]);
    expect(b.sources.website).toMatchObject({ grossThisMonth: 299900, payments: 2 });
    expect(b.sources.appStore.grossAllTime).toBe(0);
    expect(b.months.map((m: { month: string }) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(b.months[3]).toMatchObject({ month: '2026-08', gross: 19900 });
  });
});
