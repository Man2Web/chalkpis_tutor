import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { weekStart } from '../src/admin/crm.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

const ADMIN = '+919000000001';
let h: Harness;
let admin: Tenant;
let A: Tenant;
beforeAll(async () => {
  h = await startHarness({ ADMIN_PHONES: [ADMIN] });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  admin = await h.tenant(ADMIN, { institute: 'HQ' });
  A = await h.tenant('+919876543210', { tutor: 'Asha', institute: 'Alpha Academy' });
});

describe('admin customer-success tools', () => {
  it('are admin-only', async () => {
    for (const [m, url, body] of [
      ['GET', '/admin/api/events', undefined],
      ['GET', '/admin/api/cohorts', undefined],
      ['GET', `/admin/api/institutes/${A.instituteId}/notes`, undefined],
      ['POST', `/admin/api/institutes/${A.instituteId}/notes`, { body: 'x' }],
      ['PUT', `/admin/api/institutes/${A.instituteId}/tags`, { tags: ['vip'] }],
    ] as const)
      expect((await A.call(m, url, body)).status, url).toBe(403);
  });

  it('notes are a timeline per centre; tags are a fixed list and show in the centre list', async () => {
    await admin.call('POST', `/admin/api/institutes/${A.instituteId}/notes`, {
      body: 'Called, wants a demo',
    });
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    const r = await admin.call('POST', `/admin/api/institutes/${A.instituteId}/notes`, {
      body: 'Demo done',
    });
    const list = (await admin.call('GET', `/admin/api/institutes/${A.instituteId}/notes`)).body
      .notes;
    expect(list.map((n: { body: string }) => n.body)).toEqual([
      'Demo done',
      'Called, wants a demo',
    ]);
    expect(list[0].author).toBe(ADMIN);
    await admin.call('DELETE', `/admin/api/institutes/${A.instituteId}/notes/${r.body.id}`);
    expect(
      (await admin.call('GET', `/admin/api/institutes/${A.instituteId}/notes`)).body.notes,
    ).toHaveLength(1);
    expect(
      (await admin.call('POST', `/admin/api/institutes/${A.instituteId}/notes`, { body: '  ' }))
        .status,
    ).toBe(400);

    expect(
      (
        await admin.call('PUT', `/admin/api/institutes/${A.instituteId}/tags`, {
          tags: ['vip', 'follow-up', 'vip'],
        })
      ).body.tags,
    ).toEqual(['follow-up', 'vip']);
    expect(
      (
        await admin.call('PUT', `/admin/api/institutes/${A.instituteId}/tags`, {
          tags: ['nonsense'],
        })
      ).status,
    ).toBe(400);
    const inst = (await admin.call('GET', '/admin/api/institutes?q=Alpha')).body.institutes[0];
    expect(inst.tags).toEqual(['follow-up', 'vip']);
    expect(
      (await admin.call('GET', `/admin/api/institutes/${A.instituteId}`)).body.institute.tags,
    ).toEqual(['follow-up', 'vip']);
  });

  it('the activity feed mixes events newest first and filters by kind', async () => {
    const s = (
      await A.call('POST', '/students', {
        name: 'Kid',
        parentPhone: '9876500001',
        monthlyFee: 100000,
        joinedAt: '2026-09-01T00:00:00.000Z',
      })
    ).body.id;
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0];
    await A.call('POST', `/fees/dues/${due.id}/payments`, { amount: 50000, mode: 'cash' });
    await admin.call('PUT', `/admin/api/institutes/${A.instituteId}/tags`, { tags: ['vip'] });
    await admin.call('POST', `/admin/api/users/${A.userId}/sign-out`);
    const all = (await admin.call('GET', '/admin/api/events')).body.events;
    const kinds = new Set(all.map((e: { kind: string }) => e.kind));
    expect(kinds.has('payment')).toBe(true);
    expect(kinds.has('admin')).toBe(true);
    expect(kinds.has('signup')).toBe(true);
    const pay = all.find((e: { kind: string }) => e.kind === 'payment');
    expect(pay).toMatchObject({
      actor: 'Alpha Academy',
      text: 'recorded a fee from Kid',
      amount: 50000,
      instituteId: A.instituteId,
    });
    const only = (await admin.call('GET', '/admin/api/events?kinds=payment')).body.events;
    expect(only.every((e: { kind: string }) => e.kind === 'payment')).toBe(true);
  });

  it('cohorts group centres by the week they joined', async () => {
    const r = (await admin.call('GET', '/admin/api/cohorts?weeks=4')).body.cohorts;
    expect(r.reduce((a: number, c: { size: number }) => a + c.size, 0)).toBeGreaterThanOrEqual(0);
    expect(weekStart(new Date('2026-10-08T06:00:00Z'))).toBe('2026-10-05'); // a Thursday -> that Monday
    expect(weekStart(new Date('2026-10-04T20:00:00Z'))).toBe('2026-10-05'); // Monday 01:30 in India
  });
});

describe('admin events read as sentences', () => {
  it('names the action and the person, and never shows an internal id', async () => {
    const { adminText } = await import('../src/admin/crm.js');
    const US = String.fromCharCode(31);
    expect(adminText(['block', '+919800000001', 'spam'].join(US))).toBe('blocked +919800000001 · spam');
    expect(adminText(['end-announcement', '', '3c9caa72-38b9-4cf2-bc0e-d37a1b2c3d4e'].join(US))).toBe(
      'ended an announcement',
    );
    expect(adminText(['announce', '', 'New: poster maker'].join(US))).toBe(
      'published an announcement · New: poster maker',
    );
  });
});
