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
  /** Where the payer lands after paying (PhonePe sends them back here). */
  returnUrl?: string;
}

/** What the provider says about an order when asked directly: the only thing a plan is ever applied from. */
export interface OrderStatus {
  state: 'PENDING' | 'COMPLETED' | 'FAILED';
  amountPaise: number;
  /** The provider's id for the successful payment, when there is one. */
  paymentId: string | null;
}

export type ProviderName = 'razorpay' | 'phonepe' | 'mock';

/** Anything that can turn a plan purchase into a URL the owner can pay at. */
export interface BillingProvider {
  name: ProviderName;
  createPaymentLink(req: LinkRequest): Promise<PaymentLink>;
  /** Providers that can be asked about an order (PhonePe) confirm payments this way rather than trusting a webhook. */
  checkStatus?(linkId: string): Promise<OrderStatus>;
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
