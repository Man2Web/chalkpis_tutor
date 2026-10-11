import { formatIndianPhone, normalizeIndianPhone, nationalNumber } from '../phone';

describe('normalizeIndianPhone', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['098765-43210', '+919876543210'],
    ['91 98765 43210', '+919876543210'],
    ['+91 (98765) 43210', '+919876543210'],
    ['0091 9876543210', '+919876543210'],
  ])('accepts %s', (input, out) => expect(normalizeIndianPhone(input)).toBe(out));

  it.each(['', '12345', '5876543210', '98765432101', '+1 415 555 0100', 'abcdefghij'])(
    'rejects %s',
    (input) => expect(normalizeIndianPhone(input)).toBeNull(),
  );

  it('returns the national number', () =>
    expect(nationalNumber('+919876543210')).toBe('9876543210'));
});

describe('formatIndianPhone', () => {
  it('groups a mobile number the way people write it', () =>
    expect(formatIndianPhone('+919876543210')).toBe('+91 98765 43210'));
  it.each(['+14155550100', '9876543210', ''])('leaves %s alone', (v) =>
    expect(formatIndianPhone(v)).toBe(v),
  );
});
