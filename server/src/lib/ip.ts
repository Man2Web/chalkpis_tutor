import { isIPv4, isIPv6 } from 'node:net';

/**
 * The key a limit counts an address under (hardening, 9 Nov 2026): an IPv4 address as it is, an IPv6 address by its
 * /64 network, since one home or phone connection is given a whole /64 and can switch addresses inside it at will.
 * An IPv4 address written as IPv6 (::ffff:1.2.3.4) counts as the IPv4 one. Anything else is used as given.
 */
export function addressKey(ip: string | undefined | null): string {
  const a = (ip ?? '').trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(a);
  if (mapped && isIPv4(mapped[1]!)) return mapped[1]!;
  if (isIPv4(a)) return a;
  const bare = a.split('%')[0]!; // drop a zone id (fe80::1%eth0)
  if (!isIPv6(bare)) return a.slice(0, 100);
  return `${expandIPv6(bare).slice(0, 4).join(':')}::/64`;
}

/** The eight 16-bit groups of an IPv6 address, written out in full lower-case hex. */
function expandIPv6(ip: string): string[] {
  let s = ip.toLowerCase();
  // a trailing embedded IPv4 (::1.2.3.4) becomes two groups
  const v4 = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (v4) {
    const [, a, b, c, d] = v4.map(Number) as [number, number, number, number, number];
    s = `${s.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = s.includes('::') ? (s.split('::') as [string, string]) : [s, null];
  const h = head ? head.split(':') : [];
  const t = tail === null ? [] : tail ? tail.split(':') : [];
  const fill = tail === null ? [] : Array<string>(8 - h.length - t.length).fill('0');
  return [...h, ...fill, ...t].map((g) => g.padStart(4, '0'));
}
