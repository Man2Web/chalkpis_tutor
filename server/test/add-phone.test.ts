import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../src/lib/ids.js';
import { startHarness, type Harness } from './helpers.js';

/**
 * Accounts made before WhatsApp became the only sign-in may have no mobile number. They can still add one by
 * WhatsApp code while signed in, and the admin dashboard copes with them.
 */
describe('an older account without a mobile number', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(() => h.close());
  beforeEach(async () => {
    await h.reset();
    h.provider.sent = [];
  });

  const post = (url: string, payload: unknown, token: string) =>
    h.app.inject({
      method: 'POST',
      url,
      payload: payload as object,
      headers: { authorization: `Bearer ${token}` },
    });
  const lastCode = () => h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
  /** A phone-less account, signed in. */
  async function phoneless(name: string) {
    const userId = newId();
    await h.db.pool.query('INSERT INTO users (id, phone, name) VALUES (?, NULL, ?)', [
      userId,
      name,
    ]);
    return { userId, token: h.login(userId, '').token };
  }

  it('can set up a centre, and add its mobile later by WhatsApp code', async () => {
    const { userId, token } = await phoneless('Kiran');
    const inst = await post(
      '/institutes',
      { tutorName: 'Kiran', instituteName: 'Kiran Classes' },
      token,
    );
    expect(inst.statusCode).toBe(201);

    // a wrong code, then the right one
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    expect((await post('/me/phone/request', { phone: '9811100000' }, token)).statusCode).toBe(200);
    const code = lastCode();
    const wrong = code === '000000' ? '111111' : '000000';
    expect(
      (await post('/me/phone/verify', { phone: '9811100000', code: wrong }, token)).statusCode,
    ).toBe(401);
    const done = await post('/me/phone/verify', { phone: '9811100000', code }, token);
    expect(done.statusCode).toBe(200);
    expect(done.json().user.phone).toBe('+919811100000');
    const [[i]] = (await h.db.pool.query('SELECT phone FROM institutes WHERE owner_user_id = ?', [
      userId,
    ])) as unknown as [[{ phone: string }]];
    expect(i!.phone).toBe('+919811100000');
    // only once
    expect((await post('/me/phone/request', { phone: '9811100001' }, token)).statusCode).toBe(409);
  });

  it('a number that already has its own account is not taken over', async () => {
    await h.tenant('+919822200000', { tutor: 'Other' });
    const { token } = await phoneless('X');
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    await post('/me/phone/request', { phone: '9822200000' }, token);
    const r = await post('/me/phone/verify', { phone: '9822200000', code: lastCode() }, token);
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('phone_in_use');
  });

  it('the admin dashboard copes with people who have no phone', async () => {
    const admin = await h.admin();
    const { userId, token } = await phoneless('Yash');
    await post('/institutes', { tutorName: 'Yash', instituteName: 'Yash Academy' }, token);
    for (const url of [
      '/admin/api/overview',
      '/admin/api/users',
      `/admin/api/users/${userId}`,
      '/admin/api/institutes',
      '/admin/api/events',
      '/admin/api/search?q=Yash',
      '/admin/api/export/users.csv',
    ])
      expect((await admin.call('GET', url)).status, url).toBe(200);
    // a tutor app token never reaches the dashboard
    expect((await h.login(userId, '').call('GET', '/admin/api/overview')).status).toBe(401);
  });
});
