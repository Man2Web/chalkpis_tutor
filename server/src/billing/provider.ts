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

/** Anything that can turn a plan purchase into a URL the owner can pay at. */
export interface BillingProvider {
  name: ProviderName;
  createPaymentLink(req: LinkRequest): Promise<PaymentLink>;
  /** Asks the provider about an order (the return page, the app, the reconcile job). */
  checkStatus?(linkId: string): Promise<OrderStatus>;
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
