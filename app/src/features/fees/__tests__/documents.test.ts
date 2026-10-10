import { buildReminder, receiptHtml } from '../documents';

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

describe('buildReminder', () => {
  const v = {
    parentName: 'Mr Kumar',
    studentName: 'Kavin',
    amount: '₹1,500',
    period: 'Mar 2026',
    institute: 'Bright',
  };
  it('english', () => {
    const t = buildReminder('en', v);
    expect(t).toContain('Dear Mr Kumar,');
    expect(t).toContain("Kavin's fee of ₹1,500 for Mar 2026");
  });
  it('tells the parent where to pay only when a UPI id is set', () => {
    expect(buildReminder('en', v)).not.toContain('UPI');
    expect(buildReminder('en', { ...v, upiId: 'sir@oksbi' })).toContain('Pay by UPI: sir@oksbi');
    expect(buildReminder('hi', { ...v, upiId: 'sir@oksbi' })).toContain('sir@oksbi');
  });
  it('hindi', () => {
    const t = buildReminder('hi', v);
    expect(t).toContain('प्रिय Mr Kumar');
    expect(t).toContain('₹1,500');
  });
  it('works without a parent name', () =>
    expect(buildReminder('en', { ...v, parentName: ' ' }).startsWith('Hello,')).toBe(true));
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
