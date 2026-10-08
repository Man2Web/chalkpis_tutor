import { randomBytes } from 'node:crypto';

export interface OutgoingMessage {
  to: string; // E.164
  templateId: string;
  vars: string[];
  reference: string;
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

export interface MessageProvider {
  name: 'whatsapp' | 'mock';
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
            mediadata: '',
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
