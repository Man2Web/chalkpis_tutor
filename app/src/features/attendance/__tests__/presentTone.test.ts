import { presentTone } from '../logic';

describe('the colour of "n/m present"', () => {
  it('is never green when nobody came', () => {
    expect(presentTone(0, 12)).toBe('danger');
  });
  it('is amber below the low-attendance line and green at or above it', () => {
    expect(presentTone(7, 10)).toBe('warning');
    expect(presentTone(3, 4)).toBe('success');
    expect(presentTone(10, 10)).toBe('success');
  });
  it('is neutral when there is nobody to count', () => {
    expect(presentTone(0, 0)).toBe('neutral');
  });
});
