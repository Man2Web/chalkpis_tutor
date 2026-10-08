import { formatINR, parseRupeesToPaise, rupeesToPaise } from '../money';

describe('money', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(150000)).toBe('₹1,500');
    expect(formatINR(12345600)).toBe('₹1,23,456');
    expect(formatINR(0)).toBe('₹0');
  });
  it('shows paise only when present and keeps the sign', () => {
    expect(formatINR(150050)).toBe('₹1,500.50');
    expect(formatINR(-50000)).toBe('-₹500');
  });
  it('converts without float drift', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30);
  });
  it('parses user input', () => {
    expect(parseRupeesToPaise('1,500')).toBe(150000);
    expect(parseRupeesToPaise(' ₹ 1500.5')).toBe(150050);
    expect(parseRupeesToPaise('0')).toBe(0);
    expect(parseRupeesToPaise('-5')).toBeNull();
    expect(parseRupeesToPaise('12.345')).toBeNull();
    expect(parseRupeesToPaise('abc')).toBeNull();
    expect(parseRupeesToPaise('')).toBeNull();
  });
});
