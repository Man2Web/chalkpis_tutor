import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentLink {
  id: string;
  url: string;
}
export interface LinkRequest {
  amountPaise: number;
  description: string;
  referenceId: string;
  customerPhone?: string;
  /** Where the payer lands after paying (Razorpay sends them back here). */
  returnUrl?: string;
}

/** What the provider says about an order when asked directly. */
export interface OrderStatus {
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  amountPaise: number;
  /** The provider's id for the successful payment, when there is one. */
  paymentId: string | null;
}

/**
 * The gateway plans are paid through now. Older orders and payments may still name 'phonepe' or 'cashfree' (the
 * gateways used before Razorpay); those names stay in the database and on receipts.
 */
export type ProviderName = 'razorpay' | 'mock';

/** A recurring subscription at the gateway, as far as we use it. Times are Unix seconds. */
export interface GatewaySubscription {
  id: string;
  status: string;
  planId: string;
  currentEnd: number | null;
  chargeAt: number | null;
  shortUrl: string;
}
/** One invoice (one cycle's charge) of a subscription. */
export interface GatewayInvoice {
  status: string;
  paymentId: string | null;
  amountPaise: number;
}
export interface SubscriptionRequest {
  /** The gateway's plan (price and period). */
  rpPlanId: string;
  /** How many cycles the mandate covers. */
  totalCount: number;
  /** First charge at this time (Unix seconds); none = straight after the owner approves. */
  startAt?: number;
  notes: Record<string, string>;
}

/** Anything that can turn a plan purchase into a URL the owner can pay at. */
export interface BillingProvider {
  name: ProviderName;
  createPaymentLink(req: LinkRequest): Promise<PaymentLink>;
  /** Asks the provider about an order (the return page, the app, the reconcile job). */
  checkStatus?(linkId: string): Promise<OrderStatus>;
  // Recurring plans (website auto-renew).
  createPlan?(p: {
    period: 'monthly' | 'yearly';
    amountPaise: number;
    name: string;
  }): Promise<string>;
  createSubscription?(r: SubscriptionRequest): Promise<GatewaySubscription>;
  getSubscription?(id: string): Promise<GatewaySubscription>;
  cancelSubscription?(id: string, atCycleEnd: boolean): Promise<GatewaySubscription>;
  subscriptionInvoices?(id: string): Promise<GatewayInvoice[]>;
}

type RpSub = {
  id?: string;
  status?: string;
  plan_id?: string;
  current_end?: number | null;
  charge_at?: number | null;
  short_url?: string | null;
};
/** Razorpay's subscription entity in our shape (webhooks and API answers alike). */
export function toGatewaySubscription(s: RpSub): GatewaySubscription {
  return {
    id: String(s.id ?? ''),
    status: String(s.status ?? ''),
    planId: String(s.plan_id ?? ''),
    currentEnd: typeof s.current_end === 'number' ? s.current_end : null,
    chargeAt: typeof s.charge_at === 'number' ? s.charge_at : null,
    shortUrl: typeof s.short_url === 'string' ? s.short_url : '',
  };
}

const RAZORPAY_API = 'https://api.razorpay.com/v1';

/** Razorpay's own words for a refused call (code and description only, for the server log). */
async function razorpayReason(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { error?: { code?: unknown; description?: unknown } };
    return `: ${String(b.error?.code ?? '')} ${String(b.error?.description ?? '')}`.slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * Razorpay Payment Links: the owner pays on Razorpay's hosted page (UPI, cards, net banking, wallets), so neither the
 * app nor our pages load any payment script. Our order id is the link's reference_id, so an order can only be paid
 * once at Razorpay too. After paying, Razorpay sends the payer back to our return page; the plan is applied from
 * Razorpay's signed webhook or from asking Razorpay about the link (checkStatus), whichever comes first, and the
 * payment id makes sure it is applied once.
 */
export class RazorpayProvider implements BillingProvider {
  name = 'razorpay' as const;
  constructor(
    private keyId: string,
    private keySecret: string,
    private fetchFn: typeof fetch = fetch,
    private nowMs: () => number = Date.now,
  ) {}

  private call(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchFn(`${RAZORPAY_API}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
    });
  }

  async createPaymentLink(req: LinkRequest): Promise<PaymentLink> {
    const phone = (req.customerPhone ?? '').replace(/\D/g, '').slice(-10);
    const res = await this.call('/payment_links', {
      method: 'POST',
      body: JSON.stringify({
        amount: req.amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: req.description.slice(0, 2048),
        reference_id: req.referenceId,
        // only prefills Razorpay's page; Razorpay sends no SMS or email for it
        customer: /^[6-9]\d{9}$/.test(phone) ? { contact: `+91${phone}` } : undefined,
        notify: { sms: false, email: false },
        reminder_enable: false,
        // a little longer than the 15 minutes an unpaid order is reused for
        expire_by: Math.floor((this.nowMs() + 60 * 60_000) / 1000),
        ...(req.returnUrl ? { callback_url: req.returnUrl, callback_method: 'get' } : {}),
      }),
    });
    if (!res.ok) throw new Error(`razorpay-${res.status}${await razorpayReason(res)}`);
    const body = (await res.json()) as { id?: string; short_url?: string };
    if (!body.id || !body.short_url) throw new Error('razorpay-bad-response');
    return { id: body.id, url: body.short_url };
  }

  async checkStatus(linkId: string): Promise<OrderStatus> {
    const res = await this.call(`/payment_links/${encodeURIComponent(linkId)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`razorpay-link-${res.status}${await razorpayReason(res)}`);
    const link = (await res.json()) as {
      status?: string;
      amount_paid?: number;
      payments?: { payment_id?: string; status?: string; amount?: number }[] | null;
    };
    if (link.status === 'expired' || link.status === 'cancelled')
      return { state: 'FAILED', amountPaise: 0, paymentId: null };
    if (link.status !== 'paid') return { state: 'PENDING', amountPaise: 0, paymentId: null };
    // The captured payment's id is the payment id we record, the same one the webhook carries, so the webhook and a
    // check running at once still apply the plan only once.
    const paid = (Array.isArray(link.payments) ? link.payments : []).find(
      (p) => p.status === 'captured' && typeof p.payment_id === 'string',
    );
    if (!paid) return { state: 'PENDING', amountPaise: 0, paymentId: null };
    return {
      state: 'COMPLETED',
      amountPaise:
        typeof link.amount_paid === 'number' ? link.amount_paid : Number(paid.amount ?? 0),
      paymentId: paid.payment_id!.slice(0, 80),
    };
  }

  /** A Razorpay plan: the price per month or per year. Made once per price and kept (razorpay_plans). */
  async createPlan(p: { period: 'monthly' | 'yearly'; amountPaise: number; name: string }) {
    const res = await this.call('/plans', {
      method: 'POST',
      body: JSON.stringify({
        period: p.period,
        interval: 1,
        item: { name: p.name.slice(0, 100), amount: p.amountPaise, currency: 'INR' },
      }),
    });
    if (!res.ok) throw new Error(`razorpay-plan-${res.status}${await razorpayReason(res)}`);
    const body = (await res.json()) as { id?: string };
    if (!body.id) throw new Error('razorpay-bad-response');
    return body.id;
  }

  /**
   * A subscription the owner approves on Razorpay's page (UPI Autopay or a card mandate). We send the owner there
   * ourselves, so Razorpay sends no link by SMS or email.
   */
  async createSubscription(r: SubscriptionRequest) {
    const res = await this.call('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        plan_id: r.rpPlanId,
        total_count: r.totalCount,
        quantity: 1,
        customer_notify: 0,
        ...(r.startAt ? { start_at: r.startAt } : {}),
        notes: r.notes,
      }),
    });
    if (!res.ok) throw new Error(`razorpay-subscription-${res.status}${await razorpayReason(res)}`);
    const sub = toGatewaySubscription((await res.json()) as RpSub);
    if (!sub.id || !sub.shortUrl) throw new Error('razorpay-bad-response');
    return sub;
  }

  async getSubscription(id: string) {
    const res = await this.call(`/subscriptions/${encodeURIComponent(id)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`razorpay-subscription-${res.status}${await razorpayReason(res)}`);
    return toGatewaySubscription((await res.json()) as RpSub);
  }

  /** Stops the renewals: at the end of the paid cycle, or at once (nothing paid yet, or replaced by an upgrade). */
  async cancelSubscription(id: string, atCycleEnd: boolean) {
    const res = await this.call(`/subscriptions/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }),
    });
    if (!res.ok) throw new Error(`razorpay-cancel-${res.status}${await razorpayReason(res)}`);
    return toGatewaySubscription((await res.json()) as RpSub);
  }

  async subscriptionInvoices(id: string) {
    const res = await this.call(`/invoices?subscription_id=${encodeURIComponent(id)}&count=50`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error(`razorpay-invoices-${res.status}${await razorpayReason(res)}`);
    const body = (await res.json()) as {
      items?: {
        status?: string;
        payment_id?: string | null;
        amount_paid?: number;
        amount?: number;
      }[];
    };
    return (body.items ?? []).map((i) => ({
      status: String(i.status ?? ''),
      paymentId: typeof i.payment_id === 'string' ? i.payment_id.slice(0, 80) : null,
      amountPaise: Number(i.amount_paid ?? i.amount ?? 0),
    }));
  }
}

/** Local stand-in so the whole purchase flow can be tried without keys. Never built in production. */
export class MockBillingProvider implements BillingProvider {
  name = 'mock' as const;
  created: LinkRequest[] = [];
  plans: { period: string; amountPaise: number; name: string }[] = [];
  subscriptions = new Map<string, GatewaySubscription & { request: SubscriptionRequest }>();
  invoices = new Map<string, GatewayInvoice[]>();
  cancelled: { id: string; atCycleEnd: boolean }[] = [];
  private seq = 0;
  async createPaymentLink(req: LinkRequest): Promise<PaymentLink> {
    this.created.push(req);
    return { id: `mock_${req.referenceId}`, url: `mock://pay/${req.referenceId}` };
  }
  async createPlan(p: { period: 'monthly' | 'yearly'; amountPaise: number; name: string }) {
    this.plans.push(p);
    return `plan_mock${++this.seq}`;
  }
  async createSubscription(r: SubscriptionRequest) {
    const id = `sub_mock${++this.seq}`;
    const sub = {
      id,
      status: 'created',
      planId: r.rpPlanId,
      currentEnd: null,
      chargeAt: r.startAt ?? null,
      shortUrl: `https://rzp.io/mock/${id}`,
      request: r,
    };
    this.subscriptions.set(id, sub);
    return sub;
  }
  async getSubscription(id: string) {
    const s = this.subscriptions.get(id);
    if (!s) throw new Error('mock-no-subscription');
    return s;
  }
  async cancelSubscription(id: string, atCycleEnd: boolean) {
    this.cancelled.push({ id, atCycleEnd });
    const s = await this.getSubscription(id);
    if (!atCycleEnd) s.status = 'cancelled';
    return s;
  }
  async subscriptionInvoices(id: string) {
    return this.invoices.get(id) ?? [];
  }
}

/** Razorpay signs the raw request body with the webhook secret (HMAC-SHA256, hex). Constant-time compare. */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PaidEvent {
  paymentId: string;
  linkId: string;
  amountPaise: number;
}

/** A Razorpay `subscription.*` webhook: the subscription as it is now, and the payment for `subscription.charged`. */
export interface SubscriptionEvent {
  event: string;
  subscription: GatewaySubscription;
  payment: { id: string; amountPaise: number; status: string } | null;
}
export function parseSubscriptionEvent(body: unknown): SubscriptionEvent | null {
  const b = body as {
    event?: string;
    payload?: {
      subscription?: { entity?: RpSub };
      payment?: { entity?: { id?: string; amount?: number; status?: string } };
    };
  };
  if (typeof b?.event !== 'string' || !b.event.startsWith('subscription.')) return null;
  const entity = b.payload?.subscription?.entity;
  if (!entity || typeof entity.id !== 'string' || !entity.id || entity.id.length > 40) return null;
  const p = b.payload?.payment?.entity;
  const payment =
    p && typeof p.id === 'string' && p.id.length <= 80 && typeof p.amount === 'number'
      ? { id: p.id, amountPaise: p.amount, status: String(p.status ?? '') }
      : null;
  return { event: b.event, subscription: toGatewaySubscription(entity), payment };
}

/** Reads a `payment_link.paid` webhook body; null for any other event or a malformed one. */
export function parsePaymentLinkPaid(body: unknown): PaidEvent | null {
  const b = body as {
    event?: string;
    payload?: {
      payment_link?: { entity?: { id?: string; amount_paid?: number } };
      payment?: { entity?: { id?: string } };
    };
  };
  if (b?.event !== 'payment_link.paid') return null;
  const link = b.payload?.payment_link?.entity;
  const paymentId = b.payload?.payment?.entity?.id;
  if (!link?.id || !paymentId || typeof link.amount_paid !== 'number') return null;
  if (typeof link.id !== 'string' || typeof paymentId !== 'string') return null;
  if (link.id.length > 80 || paymentId.length > 80) return null;
  return { paymentId, linkId: link.id, amountPaise: link.amount_paid };
}
