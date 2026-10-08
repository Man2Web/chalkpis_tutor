import { callUrl, smsUrl, whatsappUrl } from '../contact';

describe('contact links', () => {
  it('builds tel and wa.me links without a plus sign for WhatsApp', () => {
    expect(callUrl('+919876543210')).toBe('tel:+919876543210');
    expect(whatsappUrl('+919876543210')).toBe('https://wa.me/919876543210');
  });
  it('encodes prefilled messages (Hindi included)', () => {
    expect(whatsappUrl('+919876543210', 'फीस ₹500 बाकी')).toBe(
      `https://wa.me/919876543210?text=${encodeURIComponent('फीस ₹500 बाकी')}`,
    );
    expect(smsUrl('+919876543210', 'a b')).toBe('sms:+919876543210?body=a%20b');
  });
});
