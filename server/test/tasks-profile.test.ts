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

const today = async (t: Tenant, date?: string) =>
  (await t.call('GET', `/tasks${date ? `?date=${date}` : ''}`)).body.tasks as {
    id: string;
    title: string;
    dueOn: string;
    done: boolean;
  }[];

describe("today's tasks", () => {
  it('adds a task for today, ticks it off and deletes it', async () => {
    const r = await A.call('POST', '/tasks', { title: '  Call Rohan’s parent  ' });
    expect(r.status).toBe(201);
    let list = await today(A);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: 'Call Rohan’s parent', done: false });
    expect((await A.call('PATCH', `/tasks/${r.body.id}`, { done: true })).status).toBe(200);
    expect((await today(A))[0]!.done).toBe(true);
    expect((await A.call('DELETE', `/tasks/${r.body.id}`)).status).toBe(200);
    list = await today(A);
    expect(list).toHaveLength(0);
  });

  it('carries unfinished tasks over to later days, but not finished ones', async () => {
    const open = (await A.call('POST', '/tasks', { title: 'Open', dueOn: '2026-10-01' })).body.id;
    const done = (await A.call('POST', '/tasks', { title: 'Done', dueOn: '2026-10-01' })).body.id;
    await A.call('PATCH', `/tasks/${done}`, { done: true });
    await A.call('POST', '/tasks', { title: 'Future', dueOn: '2026-12-01' });
    const list = await today(A, '2026-10-05');
    expect(list.map((t) => t.id)).toEqual([open]);
  });

  it('refuses empty titles and impossible dates', async () => {
    expect((await A.call('POST', '/tasks', { title: '   ' })).status).toBe(400);
    expect((await A.call('POST', '/tasks', { title: 'x', dueOn: '2026-02-30' })).status).toBe(400);
  });

  it("never shows or changes another institute's tasks", async () => {
    const id = (await A.call('POST', '/tasks', { title: 'Mine' })).body.id;
    expect(await today(B)).toHaveLength(0);
    expect((await B.call('PATCH', `/tasks/${id}`, { done: true })).status).toBe(404);
    expect((await B.call('DELETE', `/tasks/${id}`)).status).toBe(404);
    expect((await today(A))[0]!.done).toBe(false);
  });
});

describe('student date of birth and gender', () => {
  const student = { name: 'Asha', parentPhone: '9876500001' };
  it('are optional, saved, changed and cleared', async () => {
    const id = (await A.call('POST', '/students', student)).body.id;
    expect((await A.call('GET', `/students/${id}`)).body).toMatchObject({ dob: '', gender: '' });
    await A.call('PATCH', `/students/${id}`, { dob: '2012-03-09', gender: 'female' });
    expect((await A.call('GET', `/students/${id}`)).body).toMatchObject({
      dob: '2012-03-09',
      gender: 'female',
    });
    await A.call('PATCH', `/students/${id}`, { dob: '' });
    expect((await A.call('GET', `/students/${id}`)).body.dob).toBe('');
    expect((await A.call('PATCH', `/students/${id}`, { gender: 'x' })).status).toBe(400);
  });
});

describe('payment link', () => {
  it('accepts an https link, clears it, and refuses anything else', async () => {
    expect(
      (await A.call('PATCH', '/institute', { paymentLink: 'https://pay.example.in/sir' })).status,
    ).toBe(200);
    expect((await A.call('GET', '/institute')).body.paymentLink).toBe('https://pay.example.in/sir');
    for (const bad of ['http://pay.example.in', 'javascript:alert(1)', 'https://a b.in'])
      expect((await A.call('PATCH', '/institute', { paymentLink: bad })).status, bad).toBe(400);
    await A.call('PATCH', '/institute', { paymentLink: '' });
    expect((await A.call('GET', '/institute')).body.paymentLink).toBe('');
  });
});
