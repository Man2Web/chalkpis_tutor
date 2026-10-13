import { formatMobileInput } from '../signin';

describe('formatMobileInput', () => {
  it('shows ten digits the way people write them', () => {
    expect(formatMobileInput('9876543210')).toBe('98765 43210');
    expect(formatMobileInput('98765')).toBe('98765');
    expect(formatMobileInput('987654')).toBe('98765 4');
  });

  it('drops +91, a leading 0, spaces and dashes from a pasted number', () => {
    expect(formatMobileInput('+91 98765-43210')).toBe('98765 43210');
    expect(formatMobileInput('09876543210')).toBe('98765 43210');
  });

  it('never keeps more than ten digits', () => {
    expect(formatMobileInput('98765432109999')).toBe('98765 43210');
  });
});
