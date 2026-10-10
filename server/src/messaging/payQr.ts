import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';

export interface UpiPay {
  pa: string; // UPI id
  pn: string; // payee name
  am?: number; // paise
  tn?: string; // note
}

const b64url = (b: Buffer) => b.toString('base64url');
const sign = (secret: string, data: string) =>
  b64url(createHmac('sha256', `payqr:${secret}`).update(data).digest()).slice(0, 22);

/**
 * A public link to a UPI QR picture. WhatsApp fetches header images by URL, so the link has to work without a login;
 * it is signed so the server only draws QR codes it handed out itself.
 */
export function payQrPath(secret: string, p: UpiPay): string {
  const d = b64url(Buffer.from(JSON.stringify(p)));
  return `/pay-qr.png?d=${d}&s=${sign(secret, d)}`;
}

/** The payment details in a signed link, or null when it was not signed by this server. */
export function readPayQr(secret: string, d: unknown, s: unknown): UpiPay | null {
  if (typeof d !== 'string' || typeof s !== 'string' || d.length > 600) return null;
  const want = Buffer.from(sign(secret, d));
  const got = Buffer.from(s);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(d, 'base64url').toString('utf8')) as UpiPay;
    return typeof p.pa === 'string' && typeof p.pn === 'string' ? p : null;
  } catch {
    return null;
  }
}

/** The standard upi://pay link every UPI app understands. */
export function upiLink(p: UpiPay): string {
  const q = [`pa=${encodeURIComponent(p.pa)}`, `pn=${encodeURIComponent(p.pn.slice(0, 40))}`];
  if (p.am && p.am > 0) q.push(`am=${(p.am / 100).toFixed(2)}`);
  q.push('cu=INR');
  if (p.tn) q.push(`tn=${encodeURIComponent(p.tn.slice(0, 50))}`);
  return `upi://pay?${q.join('&')}`;
}

export const payQrPng = (p: UpiPay) =>
  QRCode.toBuffer(upiLink(p), { type: 'png', width: 800, margin: 4, errorCorrectionLevel: 'M' });
