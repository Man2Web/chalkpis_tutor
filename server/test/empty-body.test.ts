import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHarness, type Harness } from './helpers.js';

describe('a JSON request with no body', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());

  it('is treated as "no body", not refused as malformed', async () => {
    const t = await h.tenant('+919811111111');
    const r = await h.app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${t.token}`, 'content-type': 'application/json' },
    });
    expect(r.statusCode).not.toBe(400);
  });

  it('still refuses broken JSON and prototype poisoning', async () => {
    const bad = await h.app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      headers: { 'content-type': 'application/json' },
      payload: '{"phone":',
    });
    expect(bad.statusCode).toBe(400);
    const poison = await h.app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      headers: { 'content-type': 'application/json' },
      payload: '{"__proto__":{"admin":true},"phone":"9811111111"}',
    });
    expect(poison.statusCode).toBe(400);
  });
});
