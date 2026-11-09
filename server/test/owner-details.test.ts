import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addHelper, startHarness, type Harness, type Tenant } from './helpers.js';

// The owner's basic details (decision 156): email, city, state, PIN code and how they heard about Chalkpis.
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

const DETAILS = {
  email: '  Asha@Example.COM ',
  city: ' Vellore ',
  state: 'Tamil Nadu',
  pincode: '632001',
  heardFrom: 'friend',
};
const me = async (t: Tenant) => (await t.call('GET', '/me')).body.membership;

describe('owner details', () => {
  it('a centre starts without them, so the app asks; saving them stops the asking', async () => {
    expect((await me(A)).detailsDone).toBe(false);
    expect((await A.call('GET', '/institute')).body.details).toBeNull();

    const r = await A.call('PUT', '/institute/details', DETAILS);
    expect(r.status).toBe(200);
    expect((await me(A)).detailsDone).toBe(true);
    expect((await A.call('GET', '/institute')).body.details).toMatchObject({
      email: 'asha@example.com',
      city: 'Vellore',
      state: 'Tamil Nadu',
      pincode: '632001',
      heardFrom: 'friend',
      heardFromOther: '',
    });
    // only the caller's own centre
    expect((await me(B)).detailsDone).toBe(false);
  });

  it('a centre made since sign-up asked must give them first; an older one may put them off (decision 162)', async () => {
    const madeAt = (t: Tenant, at: string) =>
      h.db.pool.query('UPDATE institutes SET created_at = ? WHERE id = ?', [
        new Date(at),
        t.instituteId,
      ]);
    // signed up on a phone whose first launch ran the store build's sign-up, which had no details step
    await madeAt(A, '2026-11-05T09:31:00Z');
    // set up the day before sign-up asked for them
    await madeAt(B, '2026-11-04T18:29:59Z');
    expect(await me(A)).toMatchObject({ detailsDone: false, detailsRequired: true });
    expect(await me(B)).toMatchObject({ detailsDone: false, detailsRequired: false });

    const helper = await addHelper(h, A, { phone: '9876511111', name: 'Helper One' });
    expect(await me(helper)).toMatchObject({ detailsDone: true, detailsRequired: false });

    await A.call('PUT', '/institute/details', DETAILS);
    expect(await me(A)).toMatchObject({ detailsDone: true, detailsRequired: false });
  });

  it('can be changed later; the Other text is kept only with Other', async () => {
    await A.call('PUT', '/institute/details', { ...DETAILS, heardFromOther: 'ignored' });
    expect((await A.call('GET', '/institute')).body.details.heardFromOther).toBe('');
    await A.call('PUT', '/institute/details', {
      ...DETAILS,
      heardFrom: 'other',
      heardFromOther: 'A poster at the bus stand',
    });
    expect((await A.call('GET', '/institute')).body.details).toMatchObject({
      heardFrom: 'other',
      heardFromOther: 'A poster at the bus stand',
    });
  });

  it('refuses a wrong answer and names the field', async () => {
    const bad: [Record<string, string>, string][] = [
      [{ email: 'asha@' }, 'email'],
      [{ city: 'V' }, 'city'],
      [{ state: 'Madras' }, 'state'],
      [{ pincode: '032001' }, 'pincode'],
      [{ pincode: '63200' }, 'pincode'],
      [{ heardFrom: 'tv' }, 'heardFrom'],
      [{ heardFrom: 'other' }, 'heardFromOther'],
    ];
    for (const [change, field] of bad) {
      const r = await A.call('PUT', '/institute/details', { ...DETAILS, ...change });
      expect(r.status, JSON.stringify(change)).toBe(400);
      expect(r.body).toEqual({ error: 'bad_request', field });
    }
    expect((await me(A)).detailsDone).toBe(false);
  });

  it('works after the plan has ended (the app still asks)', async () => {
    await h.db.pool.query("UPDATE subscriptions SET status = 'expired' WHERE institute_id = ?", [
      A.instituteId,
    ]);
    expect((await A.call('PATCH', '/institute', { address: 'x' })).status).toBe(402);
    expect((await A.call('PUT', '/institute/details', DETAILS)).status).toBe(200);
  });

  it('a helper is never asked and cannot change them', async () => {
    const helper = await addHelper(h, A, { phone: '9876511111', name: 'Helper One' });
    expect((await me(helper)).detailsDone).toBe(true);
    expect((await helper.call('PUT', '/institute/details', DETAILS)).status).toBe(403);
  });

  it('the admin dashboard shows them, how centres heard about Chalkpis, and finds centres by city', async () => {
    await A.call('PUT', '/institute/details', DETAILS);
    const admin = await h.admin();
    const one = (await admin.call('GET', `/admin/api/institutes/${A.instituteId}`)).body;
    expect(one.institute.details).toMatchObject({ city: 'Vellore', heardFrom: 'friend' });
    expect(one.institute.signupChannel).toBe('app');
    const other = (await admin.call('GET', `/admin/api/institutes/${B.instituteId}`)).body;
    expect(other.institute.details).toBeNull();

    const a = (await admin.call('GET', '/admin/api/analytics')).body;
    expect(a.heardFrom).toEqual(
      expect.arrayContaining([
        { key: 'friend', count: 1, inWindow: 1 },
        { key: 'unknown', count: 1, inWindow: 1 },
      ]),
    );
    expect(a.topCities).toEqual([{ city: 'Vellore', state: 'Tamil Nadu', count: 1 }]);

    const found = (await admin.call('GET', '/admin/api/institutes?q=vellore')).body.institutes;
    expect(found.map((i: { name: string }) => i.name)).toEqual(['Alpha']);
  });
});
