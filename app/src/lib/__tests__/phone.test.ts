import { normalizeIndianPhone, nationalNumber } from '../phone';

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
