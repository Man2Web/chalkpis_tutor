import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  A = await h.tenant('+919876543210', { institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

describe("the tutor's UPI id", () => {
  it('starts empty, can be saved, is lower-cased, and can be cleared', async () => {
    expect((await A.call('GET', '/institute')).body.upiId).toBe('');
    expect((await A.call('PATCH', '/institute', { upiId: ' Tutor.Name@OkHDFCBank ' })).status).toBe(
      200,
    );
    expect((await A.call('GET', '/institute')).body.upiId).toBe('tutor.name@okhdfcbank');
    expect((await A.call('PATCH', '/institute', { upiId: '' })).status).toBe(200);
    expect((await A.call('GET', '/institute')).body.upiId).toBe('');
  });

  it('refuses things that are not a UPI id', async () => {
    for (const bad of ['nobank', 'a@b', 'two@@bank', 'x y@bank', 'upi://pay?pa=a@b', 'a@bank&am=1'])
      expect((await A.call('PATCH', '/institute', { upiId: bad })).status, bad).toBe(400);
  });

  it('belongs to one institute only', async () => {
    await A.call('PATCH', '/institute', { upiId: 'alpha@upi' });
    expect((await B.call('GET', '/institute')).body.upiId).toBe('');
  });
});
