/** Receipts are English only; the type stays so stored settings keep reading. */
export type DocLang = 'en' | 'hi';

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export type ReminderKind = 'qr' | 'link' | 'text';

export interface ReminderVars {
  studentName: string;
  amount: string; // already formatted, e.g. ₹1,500
  period: string; // e.g. Oct 2026
  institute: string;
  /** The tutor's own payment page, when set. */
  payLink?: string;
}

/** Which WhatsApp template the server will use: the payment link if set, else the UPI QR picture, else plain text. */
export const reminderKind = (o: { payLink?: string; upiId?: string }): ReminderKind =>
  o.payLink ? 'link' : o.upiId ? 'qr' : 'text';

/**
 * The exact words the parent receives (the approved WhatsApp template with the values filled in), shown to the
 * tutor before sending. Keep in step with docs/WHATSAPP-TEMPLATES.md.
 */
export function reminderPreview(kind: ReminderKind, v: ReminderVars): string {
  const details = `${v.amount} for ${v.period}`;
  if (kind === 'link')
    return `Dear Parent, the fee for ${v.studentName} is pending: ${details}. You can pay online here: ${v.payLink} Please ignore this message if you have already paid. Thank you.`;
  if (kind === 'qr')
    return `Dear Parent, the fee for ${v.studentName} is pending: ${details}. Scan the QR code above with any UPI app (Google Pay, PhonePe, Paytm) to pay ${v.institute} directly. Please ignore this message if you have already paid. Thank you.`;
  return `Dear Parent, the fee for ${v.studentName} is still pending: ${details}. Please pay at your earliest convenience. Regards, ${v.institute}. Thank you.`;
}

const LABELS = {
  en: {
    title: 'Fee Receipt',
    no: 'Receipt No',
    date: 'Date',
    student: 'Student',
    for: 'For',
    mode: 'Paid by',
    amount: 'Amount received',
    balance: 'Balance due',
    thanks: 'Thank you!',
  },
  hi: {
    title: 'फीस रसीद',
    no: 'रसीद संख्या',
    date: 'तारीख',
    student: 'विद्यार्थी',
    for: 'विवरण',
    mode: 'भुगतान का तरीका',
    amount: 'प्राप्त राशि',
    balance: 'बाकी राशि',
    thanks: 'धन्यवाद!',
  },
} as const;

export interface ReceiptVars {
  lang: DocLang;
  institute: string;
  logoUrl?: string | null;
  address?: string;
  phone?: string;
  receiptNo: string;
  date: string; // display text
  student: string;
  description: string;
  mode: string; // display text
  amount: string; // formatted
  balance: string; // formatted
  note?: string;
}

/** Receipt as printable HTML. Every value is escaped: names and notes are user input. */
export function receiptHtml(v: ReceiptVars): string {
  const L = LABELS[v.lang];
  const row = (k: string, val: string) =>
    `<tr><td class="k">${esc(k)}</td><td>${esc(val)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#14171F;padding:24px;max-width:560px;margin:auto}
h1{font-size:20px;margin:0}h2{font-size:16px;margin:16px 0 8px;color:#2F5BEA}
.head{display:flex;gap:12px;align-items:center;border-bottom:2px solid #2F5BEA;padding-bottom:12px}
.head img{width:56px;height:56px;border-radius:8px;object-fit:cover}
.muted{color:#5B6275;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:8px}td{padding:8px 0;border-bottom:1px solid #E1E4ED;font-size:15px}.k{color:#5B6275;width:42%}
.amt{font-size:22px;font-weight:700;margin-top:16px}
</style></head><body>
<div class="head">${v.logoUrl ? `<img src="${esc(v.logoUrl)}" alt="">` : ''}<div><h1>${esc(v.institute)}</h1>
${v.address ? `<div class="muted">${esc(v.address)}</div>` : ''}${v.phone ? `<div class="muted">${esc(v.phone)}</div>` : ''}</div></div>
<h2>${esc(L.title)}</h2>
<table>${row(L.no, v.receiptNo)}${row(L.date, v.date)}${row(L.student, v.student)}${row(L.for, v.description)}${row(L.mode, v.mode)}${v.note ? row('Note', v.note) : ''}</table>
<div class="amt">${esc(L.amount)}: ${esc(v.amount)}</div>
<div class="muted">${esc(L.balance)}: ${esc(v.balance)}</div>
<p class="muted" style="margin-top:24px">${esc(L.thanks)}</p>
</body></html>`;
}
