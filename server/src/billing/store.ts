import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { withTransaction, type Pool } from '../db.js';
import { queuePlanActive } from '../messaging/centreMessages.js';
import { PLANS, PLAN_RANK, storeProduct, type Cycle, type PlanId } from './plans.js';
import { leaveStore, SUB_COLUMNS, type SubRow } from './service.js';

/**
 * In-app subscriptions (App Store and Google Play) come through RevenueCat. The app identifies the buyer by the
 * centre's id (RevenueCat's "app user id"), so a subscription belongs to the centre, not to a phone. What a centre
 * has is always read back from RevenueCat's REST API with our secret key; a webhook only says "look again", so a forged
 * or out-of-order webhook cannot grant anything.
 */

export interface RcSubscription {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  purchase_date?: string;
  store: string;
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
  auto_resume_date?: string | null;
  product_plan_identifier?: string | null;
}
export interface RcSubscriber {
  subscriptions?: Record<string, RcSubscription>;
}

export interface StoreClient {
  getSubscriber(appUserId: string): Promise<RcSubscriber>;
}

export class RevenueCatClient implements StoreClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async getSubscriber(appUserId: string): Promise<RcSubscriber> {
    const res = await this.fetchFn(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: { Authorization: `Bearer ${this.secretKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`revenuecat_${res.status}`);
    const body = (await res.json()) as { subscriber?: RcSubscriber };
    return body.subscriber ?? {};
  }
}

export interface StoreState {
  store: 'app_store' | 'play_store';
  product: string;
  plan: PlanId;
  cycle: Cycle;
  expiresAt: Date;
  willRenew: boolean;
  issue: 'billing' | 'paused' | null;
  sandbox: boolean;
}

/** A Google product may come as `chalkpis.pro` with the base plan `yearly` given separately. */
const productKey = (key: string, plan?: string | null) =>
  key.includes(':') || !plan ? key : plan.includes(':') ? plan : `${key}:${plan}`;

/**
 * The store subscription that decides a centre's plan now: ours (a known product), not refunded, not ended (a billing
 * grace period counts). With more than one (an upgrade in progress), the higher plan wins.
 */
export function activeStoreSub(sub: RcSubscriber, now: Date): StoreState | null {
  let best: StoreState | null = null;
  for (const [key, s] of Object.entries(sub.subscriptions ?? {})) {
    if (s.store !== 'app_store' && s.store !== 'play_store') continue;
    const product = productKey(key, s.product_plan_identifier);
    const p = storeProduct(product);
    if (!p || s.refunded_at) continue;
    const ends = [s.expires_date, s.grace_period_expires_date]
      .map((d) => (d ? Date.parse(d) : NaN))
      .filter((n) => !Number.isNaN(n));
    if (!ends.length) continue;
    const expiresAt = new Date(Math.max(...ends));
    if (expiresAt.getTime() <= now.getTime()) continue;
    const cand: StoreState = {
      store: s.store,
      product,
      plan: p.plan,
      cycle: p.cycle,
      expiresAt,
      willRenew: !s.unsubscribe_detected_at,
      issue: s.billing_issues_detected_at ? 'billing' : s.auto_resume_date ? 'paused' : null,
      sandbox: !!s.is_sandbox,
    };
    if (
      !best ||
      PLAN_RANK[cand.plan] > PLAN_RANK[best.plan] ||
      (cand.plan === best.plan && cand.expiresAt > best.expiresAt)
    )
      best = cand;
  }
  return best;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoreRow = SubRow & { store_product: string | null; store_issue: string | null };

/**
 * Reads a centre's store subscription from RevenueCat and makes the plan match it:
 * - a store subscription is active: it decides the plan until its expiry date. When it takes over, what was left of
 *   the trial or a website plan is banked (it resumes when the store subscription ends);
 * - none is active any more but one decided the plan: the banked days resume, or the plan ends.
 * Throws when RevenueCat cannot be asked (the webhook then answers an error and RevenueCat tries again).
 */
export async function syncStore(
  pool: Pool,
  client: StoreClient,
  instituteId: string,
  now: Date,
): Promise<{ state: 'store' | 'left' | 'none' | 'missing'; plan?: string; expiresAt?: Date }> {
  if (!UUID.test(instituteId)) return { state: 'missing' };
  const [inst] = (await pool.query('SELECT id FROM institutes WHERE id = ?', [
    instituteId,
  ])) as unknown as [{ id: string }[]];
  if (!inst[0]) return { state: 'missing' };
  const store = activeStoreSub(await client.getSubscriber(instituteId), now);
  return withTransaction(pool, async (c) => {
    const [rows] = (await c.query(
      `SELECT ${SUB_COLUMNS}, store_product, store_issue FROM subscriptions WHERE institute_id = ? FOR UPDATE`,
      [instituteId],
    )) as unknown as [StoreRow[]];
    const row = rows[0];
    if (!row) return { state: 'none' as const };
    if (!store) {
      if (!row.store) return { state: 'none' as const };
      const left = await leaveStore(c, instituteId, row, now);
      return { state: 'left' as const, plan: left.plan, expiresAt: left.expiresAt };
    }
    let banked = {
      plan: row.banked_plan,
      cycle: row.banked_cycle,
      ms: row.banked_ms === null ? null : Number(row.banked_ms),
    };
    if (!row.store) {
      // the store takes over now: whatever is left of the trial or the website plan waits until it ends
      const left = row.status === 'active' ? row.expires_at.getTime() - now.getTime() : 0;
      banked =
        left > 0
          ? { plan: row.plan, cycle: row.cycle, ms: left }
          : { plan: null, cycle: null, ms: null };
    }
    const fresh = !row.store || row.plan !== store.plan || row.status !== 'active';
    const p = PLANS[store.plan];
    await c.query(
      `UPDATE subscriptions SET plan = ?, cycle = ?, status = 'active', starts_at = IF(?, ?, starts_at),
         expires_at = ?, student_limit = ?, batch_limit = ?, store = ?, store_product = ?, store_will_renew = ?,
         store_issue = ?, store_sandbox = ?, banked_plan = ?, banked_cycle = ?, banked_ms = ?
       WHERE institute_id = ?`,
      [
        store.plan,
        store.cycle,
        fresh,
        now,
        store.expiresAt,
        p.studentLimit,
        p.batchLimit,
        store.store,
        store.product,
        store.willRenew,
        store.issue,
        store.sandbox,
        banked.plan,
        banked.cycle,
        banked.ms,
        instituteId,
      ],
    );
    if (fresh)
      await queuePlanActive(
        c,
        instituteId,
        {
          paymentId: `${store.store}:${store.plan}:${store.expiresAt.getTime()}`,
          planId: store.plan,
          expiresAt: store.expiresAt,
        },
        now,
      );
    return { state: 'store' as const, plan: store.plan, expiresAt: store.expiresAt };
  });
}

/** RevenueCat's webhook body (only what we use; everything else is ignored). */
export const storeEventBody = z.object({
  event: z.object({
    id: z.string().min(1).max(100),
    type: z.string().min(1).max(40),
    app_user_id: z.string().max(200).nullish(),
    product_id: z.string().max(200).nullish(),
    period_type: z.string().max(20).nullish(),
    purchased_at_ms: z.number().nullish(),
    expiration_at_ms: z.number().nullish(),
    environment: z.string().max(20).nullish(),
    store: z.string().max(20).nullish(),
    transaction_id: z.string().max(100).nullish(),
    price_in_purchased_currency: z.number().nullish(),
    currency: z.string().max(3).nullish(),
    tax_percentage: z.number().nullish(),
    commission_percentage: z.number().nullish(),
    cancel_reason: z.string().max(40).nullish(),
    transferred_from: z.array(z.string().max(200)).nullish(),
    transferred_to: z.array(z.string().max(200)).nullish(),
  }),
});
export type StoreEvent = z.infer<typeof storeEventBody>['event'];

/** The Authorization header RevenueCat sends, set to our secret in its dashboard (with or without "Bearer "). */
export function storeWebhookAuthorized(header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

const PAID = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE']);
const PROVIDER: Record<string, 'apple' | 'google'> = { APP_STORE: 'apple', PLAY_STORE: 'google' };

/** A payment the store took, for the centre's payments and the revenue figures. Once per store transaction. */
async function recordPayment(pool: Pool, e: StoreEvent, instituteId: string, now: Date) {
  const provider = PROVIDER[e.store ?? ''];
  const p = storeProduct(e.product_id ?? '');
  const price = e.price_in_purchased_currency ?? 0;
  if (!provider || !p || !e.transaction_id || !(price > 0)) return;
  const amount = Math.round(price * 100);
  const net = Math.round(
    amount * (1 - (e.tax_percentage ?? 0)) * (1 - (e.commission_percentage ?? 0)),
  );
  await pool.query(
    `INSERT IGNORE INTO billing_events (payment_id, provider, institute_id, plan_id, cycle, amount, currency, net_amount,
       sandbox, status, note, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?)`,
    [
      `${provider}_${e.transaction_id}`,
      provider,
      instituteId,
      p.plan,
      p.cycle,
      amount,
      (e.currency ?? 'INR').toUpperCase(),
      net,
      e.environment === 'SANDBOX',
      e.period_type === 'INTRO' ? 'Intro price' : null,
      e.expiration_at_ms ? new Date(e.expiration_at_ms) : null,
      e.purchased_at_ms ? new Date(e.purchased_at_ms) : now,
    ],
  );
}

/**
 * One RevenueCat webhook delivery: every centre it concerns is synced from RevenueCat, a payment is recorded, a refund
 * marks its payment refunded. A retry of a delivery already handled does nothing; a delivery that fails (RevenueCat
 * could not be asked) is not marked handled, so its retry does the work.
 */
export async function handleStoreEvent(
  pool: Pool,
  client: StoreClient,
  e: StoreEvent,
  now: Date,
): Promise<'handled' | 'duplicate' | 'ignored'> {
  const [seen] = (await pool.query('SELECT id FROM store_events WHERE id = ?', [
    e.id,
  ])) as unknown as [{ id: string }[]];
  if (seen[0]) return 'duplicate';
  const ids = (
    e.type === 'TRANSFER'
      ? [...(e.transferred_from ?? []), ...(e.transferred_to ?? [])]
      : [e.app_user_id ?? '']
  ).filter((id, i, all) => UUID.test(id) && all.indexOf(id) === i);
  // the centre a payment or refund belongs to: the (first) one that exists
  let centre: string | null = null;
  for (const id of ids) {
    const r = await syncStore(pool, client, id, now);
    if (r.state !== 'missing') centre ??= id;
  }
  if (centre && e.type !== 'TRANSFER') {
    if (PAID.has(e.type)) await recordPayment(pool, e, centre, now);
    const provider = PROVIDER[e.store ?? ''];
    if (provider && e.transaction_id) {
      const refunded = e.type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT';
      if (refunded || e.type === 'REFUND_REVERSED')
        await pool.query(
          'UPDATE billing_events SET status = ? WHERE payment_id = ? AND institute_id = ?',
          [refunded ? 'refunded' : 'applied', `${provider}_${e.transaction_id}`, centre],
        );
    }
  }
  await pool.query('INSERT IGNORE INTO store_events (id, type, institute_id) VALUES (?, ?, ?)', [
    e.id,
    e.type,
    centre,
  ]);
  return centre ? 'handled' : 'ignored';
}

/**
 * Safety net for a missed webhook: store subscriptions ending within two days (or already past their date) are read
 * again from RevenueCat, so a renewal keeps the plan running and a lapse hands back to the banked days on time.
 */
export async function resyncEndingStoreSubscriptions(
  pool: Pool,
  client: StoreClient,
  now: Date,
): Promise<number> {
  const [rows] = (await pool.query(
    "SELECT institute_id FROM subscriptions WHERE store IS NOT NULL AND status = 'active' AND expires_at < ? LIMIT 500",
    [new Date(now.getTime() + 2 * 86_400_000)],
  )) as unknown as [{ institute_id: string }[]];
  let n = 0;
  for (const r of rows) {
    try {
      await syncStore(pool, client, r.institute_id, now);
      n++;
    } catch {
      // RevenueCat unreachable: tried again on the next run; the expiry job still hands back banked days
    }
  }
  return n;
}
