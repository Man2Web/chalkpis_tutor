import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});

describe('public legal pages', () => {
  it('serve the Privacy Policy and Terms without signing in, with the company and contact', async () => {
    for (const [url, title] of [
      ['/privacy', 'Privacy Policy'],
      ['/terms', 'Terms and Conditions'],
    ]) {
      const r = await h.app.inject({ url });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.headers['content-security-policy']).toContain("default-src 'none'");
      expect(r.body).toContain(`<h1>${title}</h1>`);
      expect(r.body).toContain('M2W Technologies Private Limited');
      expect(r.body).toContain('hello@chalkpis.com');
      expect(r.body).not.toContain('<script');
    }
    expect((await h.app.inject({ url: '/legal.css' })).statusCode).toBe(200);
  });
});
