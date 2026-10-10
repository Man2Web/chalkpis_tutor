import { cleanUpi, qrMatrix, upiLink } from '../upi';

describe('cleanUpi', () => {
  it('accepts name@bank in any case and blank', () => {
    expect(cleanUpi(' Tutor.One@OkSBI ')).toBe('tutor.one@oksbi');
    expect(cleanUpi('  ')).toBe('');
  });
  it('refuses everything else', () => {
    for (const bad of ['tutor', 'a@b', 'a b@upi', 'upi://pay?pa=x@y', 'x@upi&am=1', '@upi'])
      expect(cleanUpi(bad)).toBeNull();
  });
});

describe('upiLink', () => {
  it('builds the standard link with the amount in rupees', () => {
    expect(
      upiLink({ upiId: 'a.b@upi', payeeName: 'Sir & Co', amountPaise: 150050, note: 'Fee Mar' }),
    ).toBe('upi://pay?pa=a.b%40upi&pn=Sir%20%26%20Co&am=1500.50&cu=INR&tn=Fee%20Mar');
  });
  it('leaves the amount out when there is none', () => {
    expect(upiLink({ upiId: 'a@upi', payeeName: 'X' })).toBe('upi://pay?pa=a%40upi&pn=X&cu=INR');
  });
});

describe('qrMatrix', () => {
  it('is square with finder squares in the corners', () => {
    const m = qrMatrix(upiLink({ upiId: 'a@upi', payeeName: 'X', amountPaise: 100 }));
    expect(m.every((r) => r.length === m.length)).toBe(true);
    expect(m[0]![0]).toBe(true);
    expect(m[0]![m.length - 1]).toBe(true);
    expect(m[m.length - 1]![0]).toBe(true);
  });
});
