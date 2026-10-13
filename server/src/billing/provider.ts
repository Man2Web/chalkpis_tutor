import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentLink {
  id: string;
  url: string;
}
export interface LinkRequest {
  amountPaise: number;
  description: string;
  referenceId: string;
  customerPhone?: string;
  /** Where the payer lands after paying (PhonePe and Cashfree send them back here). */
  returnUrl?: string;
  /** Where the provider posts its server-to-server notice (Cashfree takes it per link). */
  notifyUrl?: string;
}

/** What the provider says about an order when asked directly: the only thing a plan is ever applied from. */
export interface OrderStatus {
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  amountPaise: number;
  /** The provider's id for the successful payment, when there is one. */
  paymentId: string | null;
}

export type ProviderName = 'razorpay' | 'phonepe' | 'cashfree' | 'mock';

/** Anything that can turn a plan purchase into a URL the owner can pay at. */
export interface BillingProvider {
  name: ProviderName;
  createPaymentLink(req: LinkRequest): Promise<PaymentLink>;
  /** Providers that can be asked about an order (PhonePe, Cashfree) confirm payments this way rather than trusting a webhook. */
  checkStatus?(linkId: string): Promise<OrderStatus>;
  /** Cashfree: what our checkout page needs to open the provider's payment window; null once it cannot be paid. */
  checkoutSession?(
    linkId: string,
  ): Promise<{ sessionId: string; mode: 'sandbox' | 'production' } | null>;
}

/** Razorpay Payment Links: the owner pays in the browser, so the app needs no payment SDK. */
export class RazorpayProvider implements BillingProvider {
  name = 'razorpay' as const;
  constructor(
    private keyId: string,
    private keySecret: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async createPaymentLink(req: LinkRequest): Promise<PaymentLink> {
    const res = await this.fetchFn('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: req.amountPaise,
        currency: 'INR',
        accept_partial: false,
        description: req.description,
        reference_id: req.referenceId,
        customer: req.customerPhone ? { contact: req.customerPhone } : undefined,
        notify: { sms: false, email: false },
        reminder_enable: false,
      }),
    });
    if (!res.ok) throw new Error(`razorpay-${res.status}`);
    const body = (await res.json()) as { id?: string; short_url?: string };
    if (!body.id || !body.short_url) throw new Error('razorpay-bad-response');
    return { id: body.id, url: body.short_url };
  }
}

/** Local stand-in so the whole purchase flow can be tried without keys. Never built in production. */
export class MockBillingProvider implements BillingProvider {
  name = 'mock' as const;
  created: LinkRequest[] = [];
  async createPaymentLink(req: LinkRequest): Promise<PaymentLink> {
    this.created.push(req);
    return { id: `mock_${req.referenceId}`, url: `mock://pay/${req.referenceId}` };
  }
}

const PHONEPE_HOSTS = {
  sandbox: {
    token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  production: {
    token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    pg: 'https://api.phonepe.com/apis/pg',
  },
} as const;

/**
 * PhonePe Standard Checkout (v2): the owner pays on PhonePe's hosted page (UPI, cards, net banking), so the app needs
 * no payment SDK. Calls are authorised with an O-Bearer token from PhonePe's OAuth endpoint, cached until a minute
 * before it expires. Our order id is the merchantOrderId, so an order can only ever be paid once at PhonePe too.
 */
export class PhonePeProvider implements BillingProvider {
  name = 'phonepe' as const;
  private token: { value: string; expiresAtMs: number } | null = null;
  constructor(
    private opts: {
      clientId: string;
      clientSecret: string;
      clientVersion: string;
      env: 'sandbox' | 'production';
    },
    private fetchFn: typeof fetch = fetch,
    private nowMs: () => number = Date.now,
  ) {}

  private get hosts() {
    return PHONEPE_HOSTS[this.opts.env];
  }

  private async authToken(fresh = false): Promise<string> {
    if (!fresh && this.token && this.token.expiresAtMs - 60_000 > this.nowMs())
      return this.token.value;
    const res = await this.fetchFn(this.hosts.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.opts.clientId,
        client_version: this.opts.clientVersion,
        client_secret: this.opts.clientSecret,
        grant_type: 'client_credentials',
      }).toString(),
    });
    if (!res.ok) throw new Error(`phonepe-auth-${res.status}`);
    const body = (await res.json()) as { access_token?: string; expires_at?: number };
    if (!body.access_token) throw new Error('phonepe-auth-bad-response');
    // expires_at is epoch seconds; fall back to 15 minutes if it is missing
    const expiresAtMs = body.expires_at ? body.expires_at * 1000 : this.nowMs() + 15 * 60_000;
    this.token = { value: body.access_token, expiresAtMs };
    return body.access_token;
  }

  /** One authorised call; a 401 gets one retry with a fresh token (the cached one may have been revoked). */
  private async call(path: string, init: RequestInit): Promise<Response> {
    for (const fresh of [false, true]) {
      const res = await this.fetchFn(`${this.hosts.pg}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `O-Bearer ${await this.authToken(fresh)}`,
        },
      });
      if (res.status !== 401 || fresh) return res;
    }
    throw new Error('unreachable');
  }

  async createPaymentLink(req: LinkRequest): Promise<PaymentLink> {
    const res = await this.call('/checkout/v2/pay', {
      method: 'POST',
      body: JSON.stringify({
        merchantOrderId: req.referenceId,
        amount: req.amountPaise,
        expireAfter: 1800,
        paymentFlow: {
          type: 'PG_CHECKOUT',
          message: req.description,
          ...(req.returnUrl ? { merchantUrls: { redirectUrl: req.returnUrl } } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`phonepe-${res.status}`);
    const body = (await res.json()) as { orderId?: string; redirectUrl?: string };
    if (!body.redirectUrl) throw new Error('phonepe-bad-response');
    return { id: req.referenceId, url: body.redirectUrl };
  }

  async checkStatus(merchantOrderId: string): Promise<OrderStatus> {
    const res = await this.call(
      `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`,
      { method: 'GET' },
    );
    if (!res.ok) throw new Error(`phonepe-status-${res.status}`);
    const body = (await res.json()) as {
      state?: string;
      amount?: number | string;
      paymentDetails?: { transactionId?: string; state?: string }[];
    };
    const state =
      body.state === 'COMPLETED' ? 'COMPLETED' : body.state === 'FAILED' ? 'FAILED' : 'PENDING';
    const paid = (body.paymentDetails ?? []).find((p) => p.state === 'COMPLETED');
    return {
      state,
      amountPaise: Number(body.amount ?? 0),
      paymentId: paid?.transactionId ? String(paid.transactionId).slice(0, 80) : null,
    };
  }
}

/**
 * PhonePe signs webhooks with `Authorization: SHA256(username:password)` (the pair set in its dashboard), as hex.
 * Constant-time compare; an optional "SHA256 " prefix and letter case are tolerated.
 */
export function verifyPhonePeAuth(
  header: string | undefined,
  username: string | undefined,
  password: string | undefined,
): boolean {
  if (!header || !username || !password) return false;
  const got = header
    .replace(/^sha256\s+/i, '')
    .trim()
    .toLowerCase();
  const expected = createHash('sha256').update(`${username}:${password}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The merchantOrderId a PhonePe order webhook is about; null for anything else (refunds, malformed bodies). */
export function phonePeOrderId(body: unknown): string | null {
  const b = body as { event?: string; payload?: { merchantOrderId?: unknown } };
  if (!b?.event?.startsWith('checkout.order.')) return null;
  const id = b.payload?.merchantOrderId;
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,63}$/.test(id) ? id : null;
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

const CASHFREE_HOSTS = {
  sandbox: 'https://sandbox.cashfree.com/pg',
  production: 'https://api.cashfree.com/pg',
} as const;
const CASHFREE_API_VERSION = '2026-01-01';

/** Cashfree wants times as a local ISO time without milliseconds: 2026-10-13T21:30:00+05:30. */
export function istIso(d: Date): string {
  return `${new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 19)}+05:30`;
}

/** Cashfree's own words for a refused call (code and message only, for the server log). */
async function cashfreeReason(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { code?: unknown; message?: unknown };
    return `: ${String(b.code ?? '')} ${String(b.message ?? '')}`.slice(0, 200);
  } catch {
    return '';
  }
}

/**
 * Cashfree Payment Gateway, standard checkout (Orders API). Our order id is Cashfree's order_id, so an order can only
 * be created once. The payer goes to our checkout page (checkoutUrl), which opens Cashfree's hosted payment page with
 * the order's payment session (cashfree.js); nothing about the card or UPI ever touches our server. A plan is applied
 * only from what Cashfree says when asked (checkStatus), never from a webhook body.
 */
export class CashfreeProvider implements BillingProvider {
  name = 'cashfree' as const;
  constructor(
    private opts: {
      appId: string;
      secretKey: string;
      env: 'sandbox' | 'production';
      /** Our page that opens Cashfree's checkout for one order. */
      checkoutUrl: (orderId: string) => string;
    },
    private fetchFn: typeof fetch = fetch,
    private nowMs: () => number = Date.now,
  ) {}

  private call(path: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchFn(`${CASHFREE_HOSTS[this.opts.env]}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': CASHFREE_API_VERSION,
        'x-client-id': this.opts.appId,
        'x-client-secret': this.opts.secretKey,
      },
    });
  }

  private async order(orderId: string) {
    const res = await this.call(`/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
    if (!res.ok) throw new Error(`cashfree-order-${res.status}${await cashfreeReason(res)}`);
    return (await res.json()) as { order_status?: string; payment_session_id?: string };
  }

  async createPaymentLink(req: LinkRequest): Promise<PaymentLink> {
    // Cashfree requires a phone; it only prefills its page (Cashfree sends no SMS or email for an order).
    const phone = (req.customerPhone ?? '').replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) throw new Error('cashfree-no-phone');
    const res = await this.call('/orders', {
      method: 'POST',
      body: JSON.stringify({
        order_id: req.referenceId,
        order_amount: req.amountPaise / 100,
        order_currency: 'INR',
        order_note: req.description.slice(0, 200),
        customer_details: { customer_id: `p${phone}`, customer_phone: phone },
        // a little longer than the 15 minutes an unpaid order is reused for
        order_expiry_time: istIso(new Date(this.nowMs() + 60 * 60_000)),
        order_meta: {
          ...(req.returnUrl ? { return_url: req.returnUrl } : {}),
          ...(req.notifyUrl ? { notify_url: req.notifyUrl } : {}),
        },
      }),
    });
    if (!res.ok) throw new Error(`cashfree-${res.status}${await cashfreeReason(res)}`);
    const body = (await res.json()) as { payment_session_id?: string };
    if (!body.payment_session_id) throw new Error('cashfree-bad-response');
    return { id: req.referenceId, url: this.opts.checkoutUrl(req.referenceId) };
  }

  /** What our checkout page needs to open Cashfree's window; null once the order can no longer be paid. */
  async checkoutSession(orderId: string) {
    const o = await this.order(orderId);
    if (o.order_status !== 'ACTIVE' || !o.payment_session_id) return null;
    return { sessionId: o.payment_session_id, mode: this.opts.env };
  }

  async checkStatus(orderId: string): Promise<OrderStatus> {
    const o = await this.order(orderId);
    if (o.order_status === 'EXPIRED' || o.order_status?.startsWith('TERMINAT'))
      return { state: 'FAILED', amountPaise: 0, paymentId: null };
    if (o.order_status !== 'PAID') return { state: 'PENDING', amountPaise: 0, paymentId: null };
    // The successful payment's Cashfree id is the payment id we record: an order has exactly one, so two checks
    // running at once still apply the plan only once.
    const res = await this.call(`/orders/${encodeURIComponent(orderId)}/payments`, {
      method: 'GET',
    });
    if (!res.ok) throw new Error(`cashfree-payments-${res.status}${await cashfreeReason(res)}`);
    const list = (await res.json()) as {
      cf_payment_id?: string | number;
      payment_status?: string;
      payment_amount?: number | string;
    }[];
    const paid = (Array.isArray(list) ? list : []).find(
      (p) => p.payment_status === 'SUCCESS' && p.cf_payment_id !== undefined,
    );
    if (!paid) return { state: 'PENDING', amountPaise: 0, paymentId: null };
    return {
      state: 'COMPLETED',
      amountPaise: Math.round(Number(paid.payment_amount ?? 0) * 100),
      paymentId: `cf_${String(paid.cf_payment_id)}`.slice(0, 80),
    };
  }
}

/**
 * Cashfree signs each webhook as Base64(HMAC-SHA256(x-webhook-timestamp + raw body, secret key)). Constant-time
 * compare over the exact bytes received.
 */
export function verifyCashfreeSignature(
  rawBody: string,
  timestamp: string | undefined,
  signature: string | undefined,
  secretKey: string | undefined,
): boolean {
  if (!timestamp || !signature || !secretKey) return false;
  const expected = createHmac('sha256', secretKey)
    .update(timestamp + rawBody)
    .digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The order a Cashfree payment webhook is about (data.order.order_id); null for anything else. */
export function cashfreeOrderId(rawBody: string): string | null {
  let id: unknown;
  try {
    const b = JSON.parse(rawBody) as { type?: string; data?: { order?: { order_id?: unknown } } };
    if (typeof b?.type !== 'string' || !b.type.startsWith('PAYMENT_')) return null;
    id = b.data?.order?.order_id;
  } catch {
    return null;
  }
  return typeof id === 'string' && /^[A-Za-z0-9_-]{3,50}$/.test(id) ? id : null;
}
