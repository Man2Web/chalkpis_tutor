import { describe, expect, it } from 'vitest';
import { addressKey } from '../src/lib/ip.js';

describe('addressKey: what a per-address limit counts by', () => {
  it('keeps an IPv4 address as it is, also when written as IPv6', () => {
    expect(addressKey('203.0.113.7')).toBe('203.0.113.7');
    expect(addressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });
  it('counts an IPv6 address by its /64, however it is written', () => {
    const k = '2001:0db8:0001:0002::/64';
    for (const a of [
      '2001:db8:1:2::1',
      '2001:db8:1:2:ffff:ffff:ffff:ffff',
      '2001:DB8:1:2::abcd',
      '2001:0db8:0001:0002:0000:0000:0000:0009',
      'fe80::1%eth0'.replace('fe80::1', '2001:db8:1:2::1'),
    ])
      expect(addressKey(a)).toBe(k);
    expect(addressKey('2001:db8:1:3::1')).not.toBe(k);
    // shortened forms that the old "first four groups" rule got wrong
    expect(addressKey('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
    expect(addressKey('::1')).toBe('0000:0000:0000:0000::/64');
    expect(addressKey('2001:db8:1:2::1.2.3.4')).toBe(k);
  });
  it('leaves anything else as given (cut short), and copes with nothing', () => {
    expect(addressKey('unknown')).toBe('unknown');
    expect(addressKey('')).toBe('');
    expect(addressKey(undefined)).toBe('');
    expect(addressKey('x'.repeat(500))).toHaveLength(100);
  });
});
