import { receiptHtml, reminderKind, reminderPreview } from '../documents';

const base = {
  lang: 'en' as const,
  institute: 'Bright Tuition',
  receiptNo: 'TD-00001',
  date: '8 Oct 2026',
  student: 'Kavin',
  description: 'Monthly fee',
  mode: 'Cash',
  amount: '₹1,000',
  balance: '₹500',
};

describe('reminderPreview', () => {
  const v = { studentName: 'Kavin', amount: '₹1,500', period: 'Mar 2026', institute: 'Bright' };
  it('picks the payment link first, then the UPI QR, then plain text', () => {
    expect(reminderKind({ payLink: 'https://p', upiId: 'a@b' })).toBe('link');
    expect(reminderKind({ upiId: 'a@bank' })).toBe('qr');
    expect(reminderKind({})).toBe('text');
  });
  it('fills the approved template words with the values', () => {
    expect(reminderPreview('qr', v)).toBe(
      'Dear Parent, the fee for Kavin is pending: ₹1,500 for Mar 2026. Scan the QR code above with any UPI app (Google Pay, PhonePe, Paytm) to pay Bright directly. Please ignore this message if you have already paid. Thank you.',
    );
    expect(reminderPreview('link', { ...v, payLink: 'https://pay.x/1' })).toContain(
      'You can pay online here: https://pay.x/1 Please ignore',
    );
    expect(reminderPreview('text', v)).toContain('is still pending: ₹1,500 for Mar 2026');
  });
});

describe('receiptHtml', () => {
  it('contains the key facts', () => {
    const h = receiptHtml(base);
    for (const s of ['Bright Tuition', 'TD-00001', 'Kavin', '₹1,000', '₹500', 'Fee Receipt'])
      expect(h).toContain(s);
  });
  it('escapes user-controlled text', () => {
    const h = receiptHtml({
      ...base,
      student: '<script>alert(1)</script>',
      note: 'a & b "c"',
      logoUrl: 'x" onerror="evil',
    });
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
    expect(h).toContain('a &amp; b &quot;c&quot;');
    expect(h).not.toContain('onerror="evil');
  });
  it('hindi labels', () => expect(receiptHtml({ ...base, lang: 'hi' })).toContain('फीस रसीद'));
  it('omits the logo when there is none', () => expect(receiptHtml(base)).not.toContain('<img'));
});
