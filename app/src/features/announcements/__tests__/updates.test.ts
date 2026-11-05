import { Platform } from 'react-native';
import { isPayLink, openTarget } from '../updates';
import { open } from '../../../lib/contact';

jest.mock('../../../lib/contact', () => ({ open: jest.fn().mockResolvedValue(true) }));
jest.mock('../../../api/client', () => ({ api: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

it('knows the pay pages', () => {
  expect(isPayLink('https://rzp.io/i/abc')).toBe(true);
  expect(isPayLink('https://pages.razorpay.com/x')).toBe(true);
  expect(isPayLink('https://tutor.chalkpis.com/plan')).toBe(true);
  expect(isPayLink('https://tutor.chalkpis.com/pay/tok')).toBe(true);
  expect(isPayLink('https://chalkpis.com/blog/new-features')).toBe(false);
});

describe.each(['ios', 'android'] as const)('%s app (store rules)', (os) => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', os));

  it('a billing announcement or a pay link opens Plans & billing, never a web page', () => {
    const go = jest.fn();
    openTarget(go, { link: 'https://tutor.chalkpis.com/plan', screen: '', category: 'billing' });
    openTarget(go, { link: 'https://rzp.io/i/abc', screen: '', category: 'update' });
    expect(go).toHaveBeenNthCalledWith(1, 'Billing');
    expect(go).toHaveBeenNthCalledWith(2, 'Billing');
    expect(open).not.toHaveBeenCalled();
  });

  it('other links still open', () => {
    const go = jest.fn();
    openTarget(go, { link: 'https://chalkpis.com/blog', screen: '', category: 'feature' });
    expect(open).toHaveBeenCalledWith('https://chalkpis.com/blog');
    expect(go).not.toHaveBeenCalled();
  });
});

it('the browser version opens the pay page itself', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  const go = jest.fn();
  openTarget(go, { link: 'https://tutor.chalkpis.com/plan', screen: '', category: 'billing' });
  expect(open).toHaveBeenCalledWith('https://tutor.chalkpis.com/plan');
  expect(go).not.toHaveBeenCalled();
});
