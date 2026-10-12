import { createHmac, randomBytes } from 'node:crypto';

export interface OutgoingMessage {
  to: string; // E.164
  /** The template id (ValueFirst) or template name (Meta Cloud API). */
  templateId: string;
  vars: string[];
  reference: string;
  /** Public picture for a template with an image header (the UPI QR). */
  imageUrl?: string;
  /** Authentication (login code) template: Meta needs the code again for its copy-code button. */
  otp?: boolean;
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

export interface MessageProvider {
  name: 'whatsapp' | 'meta' | 'mock';
  send(m: OutgoingMessage): Promise<SendResult>;
}

/** Stand-in for local work and tests: remembers what would have been sent. */
export class MockProvider implements MessageProvider {
  name = 'mock' as const;
  sent: OutgoingMessage[] = [];
  failNext = false;
  async send(m: OutgoingMessage): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: 'mock-failure' };
    }
    this.sent.push(m);
    return { ok: true, providerId: `mock_${m.reference}` };
  }
}

export interface WhatsAppConfig {
  baseUrl: string;
  clientId: string;
  clientPassword: string;
  from: string;
  method?: 'POST' | 'GET';
  /** Where the gateway posts delivery reports (WhatsApp's delivered / failed and its reason). */
  dlrUrl?: string;
  /** Receives one line per send with the gateway's answer (phone numbers masked). */
  log?: (line: Record<string, unknown>) => void;
}

const digits = (s: string) => s.replace(/\D/g, '');
/** Long digit runs (phone numbers) become ••••1234 so logs never hold a full number. */
export const maskDigits = (s: string) => s.replace(/\d{8,}/g, (d) => `••••${d.slice(-4)}`);
/** The secret part of the delivery-report address, so only the gateway (which we told) can post there. */
export const dlrToken = (secret: string) =>
  createHmac('sha256', secret).update('wa-dlr').digest('hex').slice(0, 32);
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

/**
 * Template sender for the "unified v2" WhatsApp gateway (body shape from the provider's sample).
 * To confirm with the provider: `templateinfo` = `<templateId>~<value1>~<value2>...`, POST vs GET.
 */
export class WhatsAppProvider implements MessageProvider {
  name = 'whatsapp' as const;
  constructor(
    private cfg: WhatsAppConfig,
    private fetchFn: typeof fetch = fetch,
  ) {}

  body(m: OutgoingMessage, now: Date = new Date()) {
    const id = randomBytes(12).toString('hex').slice(0, 23);
    return {
      apiver: '1.0',
      whatsapp: {
        ver: '2.0',
        // Delivery reports for parent and centre messages; the login code is left exactly as it has always been sent.
        dlr: { url: !m.otp && this.cfg.dlrUrl ? this.cfg.dlrUrl : '' },
        messages: [
          {
            coding: '1',
            id,
            // The gateway's types: 1 = transactional template, 3 = template with a media header and/or buttons (the
            // UPI QR, and the login code with its copy-code button).
            msgtype: m.imageUrl || m.otp ? '3' : '1',
            text: '',
            templateinfo: [m.templateId, ...m.vars].join('~'),
            // A header picture (the UPI QR) needs all three, as in the gateway's documentation: the media type, its
            // MIME type and a public URL. Without `type` the gateway accepts the message but WhatsApp drops it.
            type: m.imageUrl ? 'image' : '',
            ...(m.imageUrl ? { contenttype: 'image/png' } : {}),
            mediadata: m.imageUrl ?? '',
            b_urlinfo: '1',
            filename: '',
            addresses: [
              {
                seq: `${randomBytes(10).toString('hex')}-${ymd(now)}`,
                to: digits(m.to),
                from: digits(this.cfg.from),
                tag: m.reference,
              },
            ],
          },
        ],
      },
    };
  }

  async send(m: OutgoingMessage): Promise<SendResult> {
    const body = this.body(m);
    try {
      const res = await this.fetchFn(this.cfg.baseUrl, {
        method: this.cfg.method ?? 'POST',
        headers: {
          'x-client-id': this.cfg.clientId,
          'x-client-password': this.cfg.clientPassword,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (this.cfg.log) {
        // The gateway can answer 200 and still refuse the message in its body, so keep what it said.
        const answer = await res.text().catch(() => '');
        this.cfg.log({
          wa: 'send',
          ref: m.reference,
          template: m.templateId,
          msgtype: body.whatsapp.messages[0]?.msgtype,
          http: res.status,
          answer: maskDigits(answer).slice(0, 500),
        });
      }
      if (!res.ok) return { ok: false, error: `http-${res.status}` };
      return { ok: true, providerId: body.whatsapp.messages[0]?.id };
    } catch (e) {
      // Never put the request (phone numbers, credentials) into the error text.
      return { ok: false, error: (e as { code?: string }).code ?? (e as Error).name ?? 'network' };
    }
  }
}

export interface MetaCloudConfig {
  /** The WhatsApp phone number id from Meta (not the phone number itself). */
  phoneNumberId: string;
  /** A permanent system-user access token with whatsapp_business_messaging. */
  token: string;
  /** Graph API version, e.g. v23.0. */
  version?: string;
  /** Template language code; templates are English only. */
  language?: string;
}

/**
 * Sends approved templates straight through Meta's WhatsApp Cloud API
 * (POST https://graph.facebook.com/<version>/<phone-number-id>/messages). Template ids here are template NAMES.
 */
export class MetaCloudProvider implements MessageProvider {
  name = 'meta' as const;
  constructor(
    private cfg: MetaCloudConfig,
    private fetchFn: typeof fetch = fetch,
  ) {}

  body(m: OutgoingMessage) {
    const text = (t: string) => ({ type: 'text', text: t });
    const components: unknown[] = [];
    if (m.imageUrl)
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: m.imageUrl } }],
      });
    if (m.vars.length) components.push({ type: 'body', parameters: m.vars.map(text) });
    if (m.otp && m.vars[0])
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [text(m.vars[0])],
      });
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: digits(m.to),
      type: 'template',
      template: {
        name: m.templateId,
        language: { code: this.cfg.language ?? 'en' },
        ...(components.length ? { components } : {}),
      },
      biz_opaque_callback_data: m.reference,
    };
  }

  async send(m: OutgoingMessage): Promise<SendResult> {
    const url = `https://graph.facebook.com/${this.cfg.version ?? 'v23.0'}/${this.cfg.phoneNumberId}/messages`;
    try {
      const res = await this.fetchFn(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(this.body(m)),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { code?: number };
      };
      if (!res.ok) return { ok: false, error: `meta-${json.error?.code ?? res.status}` };
      return { ok: true, providerId: json.messages?.[0]?.id };
    } catch (e) {
      // Never put the request (phone numbers, the token) into the error text.
      return { ok: false, error: (e as { code?: string }).code ?? (e as Error).name ?? 'network' };
    }
  }
}
