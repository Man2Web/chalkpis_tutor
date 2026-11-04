import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const kid = (t: Tenant, name: string, over = {}) =>
  mk(t, '/students', {
    name,
    parentName: 'Meena',
    parentPhone: '9876500001',
    monthlyFee: 100000,
    batchIds: [],
    ...over,
  });
const family = async (id: string) => (await A.call('GET', `/students/${id}/family`)).body;
const familyId = async (id: string) =>
  (await A.call('GET', `/students/${id}`)).body.familyId as string | null;

let asha: string;
let ravi: string;

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
  asha = await kid(A, 'Asha');
  ravi = await kid(A, 'Ravi');
});

// the harness clock is 2026-10-08
describe('brothers and sisters', () => {
  it('a shared parent number alone links no one', async () => {
    expect(await familyId(asha)).toBeNull();
    expect(await family(asha)).toEqual({ familyId: null, members: [], outstanding: 0, overdue: 0 });
  });

  it('adds a child as a brother or sister, and shows the family with what each owes', async () => {
    const meera = await kid(A, 'Meera', { familyWith: asha });
    expect(await familyId(meera)).toBe(await familyId(asha));
    expect(await familyId(ravi)).toBeNull();
    await A.call('POST', '/fees/generate', {});
    const f = await family(meera);
    expect(f.members.map((m: { name: string }) => m.name)).toEqual(['Asha', 'Meera']);
    expect(f.members[0]).toMatchObject({ class: '', status: 'active', outstanding: 100000 });
    expect(f.outstanding).toBe(200000);
    // a brother or sister who does not exist leaves no student behind
    const bad = await A.call('POST', '/students', {
      name: 'Nobody',
      parentPhone: '9876500001',
      monthlyFee: 0,
      batchIds: [],
      familyWith: '00000000-0000-4000-8000-000000000000',
    });
    expect(bad.body.error).toBe('unknown_sibling');
    const names = (await A.call('GET', '/students?status=all')).body.students.map(
      (s: { name: string }) => s.name,
    );
    expect(names).not.toContain('Nobody');
  });

  it('links existing children, joining whole families together', async () => {
    const meera = await kid(A, 'Meera');
    const dev = await kid(A, 'Dev');
    expect((await A.call('POST', `/students/${asha}/family`, { studentId: ravi })).status).toBe(
      200,
    );
    expect((await A.call('POST', `/students/${meera}/family`, { studentId: dev })).status).toBe(
      200,
    );
    // Ravi's family meets Meera's: all four are one family now
    await A.call('POST', `/students/${ravi}/family`, { studentId: meera });
    const ids = new Set(await Promise.all([asha, ravi, meera, dev].map(familyId)));
    expect(ids.size).toBe(1);
    expect((await family(dev)).members).toHaveLength(4);
    expect((await A.call('POST', `/students/${asha}/family`, { studentId: asha })).body.error).toBe(
      'same_student',
    );
  });

  it('unlinks one child; a family of one is no family', async () => {
    const meera = await kid(A, 'Meera', { familyWith: asha });
    await A.call('POST', `/students/${ravi}/family`, { studentId: asha });
    expect((await A.call('DELETE', `/students/${meera}/family`)).status).toBe(200);
    expect(await familyId(meera)).toBeNull();
    expect((await family(asha)).members).toHaveLength(2);
    await A.call('DELETE', `/students/${ravi}/family`);
    expect(await familyId(asha)).toBeNull();
  });

  it('keeps families inside one centre', async () => {
    const other = await kid(B, 'Other');
    expect((await A.call('POST', `/students/${asha}/family`, { studentId: other })).status).toBe(
      404,
    );
    expect((await B.call('GET', `/students/${asha}/family`)).status).toBe(404);
    expect((await B.call('DELETE', `/students/${asha}/family`)).status).toBe(404);
    expect(
      (
        await B.call('POST', '/students', {
          name: 'Xavier',
          parentPhone: '9876500001',
          monthlyFee: 0,
          batchIds: [],
          familyWith: asha,
        })
      ).body.error,
    ).toBe('unknown_sibling');
  });

  it("opens every linked child from one parent link, and never anyone else's", async () => {
    const meera = await kid(A, 'Meera', { familyWith: asha });
    const link = await A.call('POST', `/students/${asha}/parent-link`, {});
    const view = (child?: string) =>
      h.app.inject({
        method: 'POST',
        url: '/api/parent',
        payload: child ? { token: link.body.token, child } : { token: link.body.token },
      });
    const own = (await view()).json();
    expect(own.student.name).toBe('Asha');
    expect(own.family).toEqual([
      { id: asha, name: 'Asha', className: '', current: true },
      { id: meera, name: 'Meera', className: '', current: false },
    ]);
    const sister = await view(meera);
    expect(sister.statusCode).toBe(200);
    expect(sister.json().student.name).toBe('Meera');
    expect(sister.json().family.find((f: { current: boolean }) => f.current).id).toBe(meera);
    // Ravi has the same parent number but is not linked
    expect((await view(ravi)).statusCode).toBe(404);
    // an unlinked child's page has no switch
    const solo = await A.call('POST', `/students/${ravi}/parent-link`, {});
    const r = await h.app.inject({
      method: 'POST',
      url: '/api/parent',
      payload: { token: solo.body.token },
    });
    expect(r.json().family).toEqual([]);
    // a sister who left the centre drops out of the switch
    await A.call('POST', `/students/${meera}/deactivate`, {});
    expect((await view()).json().family).toEqual([]);
    expect((await view(meera)).statusCode).toBe(404);
  });

  it('keeps families from helpers, who never see fees', async () => {
    await kid(A, 'Meera', { familyWith: asha });
    const batch = await mk(A, '/batches', {
      name: 'Maths 10',
      subject: 'Maths',
      class: '10',
      days: ['mon'],
      startTime: '17:00',
      endTime: '18:00',
      defaultFee: 150000,
    });
    await A.call('PATCH', `/students/${asha}`, { batchIds: [batch] });
    const r = await A.call('POST', '/staff', {
      phone: '9876511111',
      name: 'Helper',
      batchIds: [batch],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const helper = h.login(r.body.id as string, A.instituteId);
    expect((await A.call('GET', `/students/${asha}`)).body.familyId).toBeTruthy();
    expect((await helper.call('GET', `/students/${asha}`)).body.familyId).toBeNull();
    expect((await helper.call('GET', `/students/${asha}/family`)).status).toBe(403);
    expect(
      (await helper.call('POST', `/students/${asha}/family`, { studentId: ravi })).status,
    ).toBe(403);
  });
});
