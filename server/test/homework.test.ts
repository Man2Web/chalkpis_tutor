import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

const batch = (over = {}) => ({
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['mon'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};

let batchId: string;
let asha: string;
let ravi: string;
let hw: string;

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
  batchId = await mk(A, '/batches', batch());
  const kid = (name: string, phone: string) =>
    mk(A, '/students', { name, parentPhone: phone, monthlyFee: 100000, batchIds: [batchId] });
  asha = await kid('Asha', '9876500001');
  ravi = await kid('Ravi', '9876500002');
  // the harness clock is 2026-10-08
  hw = await mk(A, '/homework', {
    batchId,
    title: 'Exercise 4.2, Q1-10',
    subject: 'Algebra',
    details: 'Show all steps',
    dueOn: '2026-10-10',
  });
});

describe('homework', () => {
  it('sets homework for a batch, dated today, and lists it with the batch and checks so far', async () => {
    const list = (await A.call('GET', '/homework')).body.homework;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: hw,
      batchName: 'Maths 10',
      title: 'Exercise 4.2, Q1-10',
      subject: 'Algebra',
      details: 'Show all steps',
      setOn: '2026-10-08',
      dueOn: '2026-10-10',
      done: 0,
      missing: 0,
      students: 2,
    });
    expect((await A.call('GET', `/homework?batchId=${batchId}`)).body.homework).toHaveLength(1);
  });

  it('refuses a due day before the day it was set', async () => {
    const r = await A.call('POST', '/homework', {
      batchId,
      title: 'Old',
      setOn: '2026-10-08',
      dueOn: '2026-10-01',
    });
    expect(r.status).toBe(400);
    expect((await A.call('PATCH', `/homework/${hw}`, { dueOn: '2026-10-01' })).body.error).toBe(
      'due_before_set',
    );
    expect((await A.call('PATCH', `/homework/${hw}`, { dueOn: '2026-10-12' })).status).toBe(200);
  });

  it('ticks who handed it in and who did not, and clears a tick', async () => {
    const r = await A.call('PUT', `/homework/${hw}/checks`, {
      checks: [
        { studentId: asha, status: 'done' },
        { studentId: ravi, status: 'missing' },
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await A.call('GET', '/homework')).body.homework[0]).toMatchObject({
      done: 1,
      missing: 1,
    });
    await A.call('PUT', `/homework/${hw}/checks`, { checks: [{ studentId: ravi, status: null }] });
    const got = (await A.call('GET', `/homework/${hw}`)).body;
    expect(new Set(got.roster)).toEqual(new Set([asha, ravi]));
    expect(got.checks).toEqual([{ studentId: asha, status: 'done' }]);
  });

  it("shows a student's homework with their own tick, and the parent sees it", async () => {
    await A.call('PUT', `/homework/${hw}/checks`, {
      checks: [{ studentId: ravi, status: 'missing' }],
    });
    const mine = (await A.call('GET', `/students/${ravi}/homework`)).body.homework;
    expect(mine[0]).toMatchObject({ title: 'Exercise 4.2, Q1-10', status: 'missing' });
    expect((await A.call('GET', `/students/${asha}/homework`)).body.homework[0].status).toBeNull();
    const link = await A.call('POST', `/students/${ravi}/parent-link`, {});
    const view = await h.app.inject({
      method: 'POST',
      url: '/api/parent',
      payload: { token: link.body.token },
    });
    expect(view.json().homework[0]).toMatchObject({
      title: 'Exercise 4.2, Q1-10',
      dueOn: '2026-10-10',
      status: 'missing',
    });
  });

  it('keeps every centre to its own homework, and refuses students from elsewhere', async () => {
    expect((await B.call('GET', '/homework')).body.homework).toHaveLength(0);
    expect((await B.call('GET', `/homework/${hw}`)).status).toBe(404);
    expect((await B.call('DELETE', `/homework/${hw}`)).status).toBe(404);
    expect(
      (await B.call('POST', '/homework', { batchId, title: 'x', dueOn: '2026-10-10' })).status,
    ).toBe(404);
    const bBatch = await mk(B, '/batches', batch());
    const outsider = await mk(B, '/students', {
      name: 'Other',
      parentPhone: '9876500009',
      monthlyFee: 0,
      batchIds: [bBatch],
    });
    const r = await A.call('PUT', `/homework/${hw}/checks`, {
      checks: [{ studentId: outsider, status: 'done' }],
    });
    expect(r.body.error).toBe('unknown_student');
  });

  it('deletes homework with its ticks', async () => {
    await A.call('PUT', `/homework/${hw}/checks`, {
      checks: [{ studentId: asha, status: 'done' }],
    });
    expect((await A.call('DELETE', `/homework/${hw}`)).status).toBe(200);
    expect((await A.call('GET', '/homework')).body.homework).toHaveLength(0);
    expect((await A.call('GET', `/students/${asha}/homework`)).body.homework).toHaveLength(0);
  });
});
