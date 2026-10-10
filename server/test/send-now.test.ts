import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MetaCloudProvider } from '../src/messaging/provider.js';
import { parseTemplates } from '../src/messaging/templates.js';
import { processQueue } from '../src/messaging/worker.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const BASE = 'https://tutor.example.in';
const TEMPLATES = parseTemplates(
  JSON.stringify({
    fee_overdue: { en: 'tutordesk_fee_overdue' },
    payment_received: { en: 'tutordesk_payment_received' },
    fee_reminder: { en: 'chalkpis_fee_reminder' },
    fee_link: { en: 'chalkpis_fee_link' },
    parent_link: { en: 'chalkpis_parent_link' },
  }),
);

let h: Harness;
let A: Tenant;
let B: Tenant;
beforeAll(async () => {
  h = await startHarness({ PUBLIC_BASE_URL: BASE });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  h.provider.sent.length = 0;
  A = await h.tenant('+919876543210', { institute: 'Alpha Tuition' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const run = () =>
  processQueue({
    pool: h.db.pool,
    provider: h.provider,
    templates: TEMPLATES,
    clock: () => h.clock.now,
  });
const mkStudent = async (t: Tenant, over = {}) =>
  (
    await t.call('POST', '/students', {
      name: 'Asha Rao',
      parentPhone: '9876500001',
      monthlyFee: 150000,
      joinedAt: '2026-09-01T00:00:00.000Z',
      ...over,
    })
  ).body.id as string;

describe('fee reminder sent now', () => {
  it('with a UPI id: sends the QR template with a signed picture link for the exact amount, even with messages off', async () => {
    await A.call('PATCH', '/institute', { upiId: 'alpha@oksbi' });
    const s = await mkStudent(A);
    await A.call('POST', '/fees/generate', {});
    const r = await A.call('POST', `/students/${s}/remind`);
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ kind: 'qr', amount: 150000 });
    expect(await run()).toMatchObject({ sent: 1 });
    const m = h.provider.sent[0]!;
    expect(m.templateId).toBe('chalkpis_fee_reminder');
    expect(m.vars).toEqual(['Asha Rao', '₹1,500 for Oct 2026', 'Alpha Tuition']);
    expect(m.imageUrl).toMatch(/^https:\/\/tutor\.example\.in\/pay-qr\.png\?d=.+&s=.+$/);

    // the picture link works without signing in and is a PNG; a tampered link is a 404
    const path = m.imageUrl!.slice(BASE.length);
    const img = await h.app.inject({ url: path });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.rawPayload.subarray(1, 4).toString()).toBe('PNG');
    expect((await h.app.inject({ url: path.replace(/s=./, 's=X') })).statusCode).toBe(404);
  });

  it('with a payment link: sends the link template instead of the QR', async () => {
    await A.call('PATCH', '/institute', {
      upiId: 'alpha@oksbi',
      paymentLink: 'https://pay.alpha.in/x',
    });
    const s = await mkStudent(A);
    await A.call('POST', '/fees/generate', {});
    expect((await A.call('POST', `/students/${s}/remind`)).body.kind).toBe('link');
    await run();
    expect(h.provider.sent[0]).toMatchObject({
      templateId: 'chalkpis_fee_link',
      vars: ['Asha Rao', '₹1,500 for Oct 2026', 'https://pay.alpha.in/x'],
    });
    expect(h.provider.sent[0]!.imageUrl).toBeUndefined();
  });

  it('refuses a second send within 10 minutes, when nothing is owed, and for another institute', async () => {
    const s = await mkStudent(A);
    expect((await A.call('POST', `/students/${s}/remind`)).body.error).toBe('nothing_due');
    await A.call('POST', '/fees/generate', {});
    expect((await A.call('POST', `/students/${s}/remind`)).body.kind).toBe('text'); // no UPI id, no link
    expect((await A.call('POST', `/students/${s}/remind`)).body.error).toBe('recently_sent');
    expect((await B.call('POST', `/students/${s}/remind`)).status).toBe(404);
  });
});

describe('parent link and receipt sent now', () => {
  it('a new parent link can be sent on WhatsApp straight away', async () => {
    const s = await mkStudent(A);
    const r = await A.call('POST', `/students/${s}/parent-link`, { days: 30, sendWhatsApp: true });
    expect(r.status).toBe(201);
    expect(r.body.sent).toBe(true);
    await run();
    expect(h.provider.sent[0]).toMatchObject({ templateId: 'chalkpis_parent_link' });
    expect(h.provider.sent[0]!.vars).toEqual(['Asha Rao', r.body.url, 'Alpha Tuition']);
  });

  it('a receipt can be sent again, but not for a reversed payment', async () => {
    const s = await mkStudent(A);
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0];
    const pay = (
      await A.call('POST', `/fees/dues/${due.id}/payments`, { amount: 50000, mode: 'cash' })
    ).body;
    expect((await A.call('POST', `/fees/payments/${pay.paymentId}/send-receipt`)).status).toBe(202);
    await run();
    expect(h.provider.sent[0]).toMatchObject({
      templateId: 'tutordesk_payment_received',
      vars: ['Asha Rao', `₹500 (receipt ${pay.receiptNo}, balance due ₹1,000)`, 'Alpha Tuition'],
    });
    await A.call('POST', `/fees/payments/${pay.paymentId}/reverse`);
    h.clock.now = new Date(h.clock.now.getTime() + 11 * 60_000);
    expect((await A.call('POST', `/fees/payments/${pay.paymentId}/send-receipt`)).body.error).toBe(
      'not_sendable',
    );
  });
});

describe('Meta Cloud API request', () => {
  it('sends the template by name with body values, the header picture and the OTP button', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new MetaCloudProvider({ phoneNumberId: '1234567890', token: 'T'.repeat(30) }, fake);
    const r = await p.send({
      to: '+919876500001',
      templateId: 'chalkpis_fee_reminder',
      vars: ['A', 'B', 'C'],
      reference: 'm1',
      imageUrl: 'https://x/qr.png',
    });
    expect(r).toEqual({ ok: true, providerId: 'wamid.X' });
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v23.0/1234567890/messages');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${'T'.repeat(30)}`,
    );
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '919876500001',
      type: 'template',
      template: {
        name: 'chalkpis_fee_reminder',
        language: { code: 'en' },
        components: [
          { type: 'header', parameters: [{ type: 'image', image: { link: 'https://x/qr.png' } }] },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'A' },
              { type: 'text', text: 'B' },
              { type: 'text', text: 'C' },
            ],
          },
        ],
      },
    });
    const otp = p.body({
      to: '+911',
      templateId: 'tutor_desk',
      vars: ['123456'],
      reference: 'o',
      otp: true,
    });
    expect(otp.template.components).toContainEqual({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: '123456' }],
    });
  });

  it('reports a Meta error code without leaking the request', async () => {
    const fake = (async () =>
      new Response(
        JSON.stringify({ error: { code: 132001, message: 'Template does not exist' } }),
        {
          status: 400,
        },
      )) as unknown as typeof fetch;
    const p = new MetaCloudProvider({ phoneNumberId: '1', token: 'T'.repeat(30) }, fake);
    expect(
      await p.send({ to: '+919876500001', templateId: 'x', vars: [], reference: 'r' }),
    ).toEqual({
      ok: false,
      error: 'meta-132001',
    });
  });
});
