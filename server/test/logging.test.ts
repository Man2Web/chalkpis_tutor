import { describe, expect, it } from 'vitest';
import { safeUrl } from '../src/logging.js';

describe('safeUrl', () => {
  it('drops the query string, which can carry phone numbers or codes', () => {
    expect(safeUrl('/api/students?phone=919876543210&q=asha')).toBe('/api/students');
  });
  it('hides parent-link tokens', () => {
    const t = 'RKT9CTQtaF5ijtyHkcYTqU6KiWXVkVymPXsICww39wg';
    expect(safeUrl(`/p/${t}`)).toBe('/p/[hidden]');
    expect(safeUrl(`/p/${t}?lang=hi`)).toBe('/p/[hidden]');
  });
  it('leaves ordinary paths alone', () => {
    expect(safeUrl('/health')).toBe('/health');
    expect(safeUrl('/p/short')).toBe('/p/short');
  });
});
