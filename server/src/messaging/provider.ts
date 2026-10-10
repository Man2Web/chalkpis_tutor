import { randomBytes } from 'node:crypto';

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
}

const digits = (s: string) => s.replace(/\D/g, '');
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
        dlr: { url: '' },
        messages: [
          {
            coding: '1',
            id,
            msgtype: '3',
            text: '',
            templateinfo: [m.templateId, ...m.vars].join('~'),
            type: '',
            // ValueFirst's field for a header picture (to confirm with ValueFirst for image templates)
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
