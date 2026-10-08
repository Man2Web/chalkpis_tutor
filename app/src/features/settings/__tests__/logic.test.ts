import { canDelete, cleanPrefix } from '../logic';

describe('cleanPrefix', () => {
  it.each([
    ['td', 'TD'],
    [' Rcpt1 ', 'RCPT1'],
    ['AB', 'AB'],
    ['ABCDEF', 'ABCDEF'],
  ])('accepts %s', (i, o) => expect(cleanPrefix(i)).toBe(o));
  it.each(['', 'A', 'ABCDEFG', 'T-D', 'T D', 'ट'])('rejects "%s"', (i) =>
    expect(cleanPrefix(i)).toBeNull(),
  );
});

describe('canDelete', () => {
  it('only the exact word unlocks deletion (any case, spaces ignored)', () => {
    expect(canDelete('DELETE')).toBe(true);
    expect(canDelete(' delete ')).toBe(true);
    expect(canDelete('')).toBe(false);
    expect(canDelete('DELET')).toBe(false);
    expect(canDelete('yes')).toBe(false);
    expect(canDelete('DELETE ME')).toBe(false);
  });
});
