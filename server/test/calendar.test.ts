import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

const batch = (over = {}) => ({
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['mon', 'wed'],
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

let maths: string;
let science: string;
let asha: string;

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
  maths = await mk(A, '/batches', batch());
  science = await mk(A, '/batches', batch({ name: 'Science 9', subject: 'Science' }));
  asha = await mk(A, '/students', {
    name: 'Asha',
    parentPhone: '9876500001',
    monthlyFee: 100000,
    batchIds: [maths],
  });
});

// the harness clock is 2026-10-08
describe('calendar', () => {
  it('adds holidays and events, one day or several, and shows them with tests and homework in a range', async () => {
    const diwali = await mk(A, '/calendar/events', {
      title: 'Diwali holidays',
      kind: 'holiday',
      startsOn: '2026-11-07',
      endsOn: '2026-11-10',
    });
    await mk(A, '/calendar/events', {
      title: 'Parent meeting',
      kind: 'meeting',
      startsOn: '2026-10-24',
      batchId: maths,
      notes: '10 am, bring the report card',
    });
    await mk(A, '/exams', {
      batchId: maths,
      name: 'Unit test 3',
      date: '2026-10-20',
      maxMarks: 25,
    });
    await mk(A, '/homework', { batchId: science, title: 'Chapter 5', dueOn: '2026-10-21' });

    const oct = (await A.call('GET', '/calendar?from=2026-10-01&to=2026-10-31')).body;
    expect(oct.events).toEqual([
      expect.objectContaining({
        title: 'Parent meeting',
        kind: 'meeting',
        startsOn: '2026-10-24',
        endsOn: '2026-10-24',
        batchName: 'Maths 10',
        notes: '10 am, bring the report card',
      }),
    ]);
    expect(oct.exams).toEqual([
      expect.objectContaining({ name: 'Unit test 3', date: '2026-10-20', batchName: 'Maths 10' }),
    ]);
    expect(oct.homework).toEqual([
      expect.objectContaining({ title: 'Chapter 5', dueOn: '2026-10-21', batchName: 'Science 9' }),
    ]);
    // an event across days shows in every range it touches
    const ends = (await A.call('GET', '/calendar?from=2026-11-09&to=2026-11-30')).body.events;
    expect(ends.map((e: { id: string }) => e.id)).toEqual([diwali]);
  });

  it('refuses an end before the start, a too-wide range, and an unknown batch', async () => {
    const bad = (body: unknown) => A.call('POST', '/calendar/events', body);
    expect(
      (await bad({ title: 'x', startsOn: '2026-10-10', endsOn: '2026-10-09' })).body.error,
    ).toBe('ends_before_start');
    expect((await bad({ title: 'x', startsOn: '2026-02-30' })).status).toBe(400);
    expect(
      (
        await bad({
          title: 'x',
          startsOn: '2026-10-10',
          batchId: '00000000-0000-4000-8000-000000000000',
        })
      ).body.error,
    ).toBe('unknown_batch');
    expect((await A.call('GET', '/calendar?from=2026-01-01&to=2026-12-31')).status).toBe(400);
    expect((await A.call('GET', '/calendar?from=2026-10-10&to=2026-10-01')).status).toBe(400);
  });

  it('edits and deletes an event; moving the start past the end moves the end too', async () => {
    const id = await mk(A, '/calendar/events', { title: 'Sports day', startsOn: '2026-10-15' });
    expect(
      (await A.call('PATCH', `/calendar/events/${id}`, { startsOn: '2026-10-17', kind: 'event' }))
        .status,
    ).toBe(200);
    expect((await A.call('GET', `/calendar/events/${id}`)).body).toMatchObject({
      title: 'Sports day',
      startsOn: '2026-10-17',
      endsOn: '2026-10-17',
    });
    expect(
      (await A.call('PATCH', `/calendar/events/${id}`, { endsOn: '2026-10-16' })).body.error,
    ).toBe('ends_before_start');
    expect((await A.call('DELETE', `/calendar/events/${id}`)).status).toBe(200);
    expect((await A.call('GET', `/calendar/events/${id}`)).status).toBe(404);
  });

  it("shows the parent what is coming up for their child's batches and the whole centre", async () => {
    await mk(A, '/calendar/events', {
      title: 'Diwali holidays',
      kind: 'holiday',
      startsOn: '2026-11-07',
      endsOn: '2026-11-10',
    });
    await mk(A, '/calendar/events', {
      title: 'Maths PTM',
      kind: 'meeting',
      startsOn: '2026-10-24',
      batchId: maths,
    });
    await mk(A, '/calendar/events', {
      title: 'Science fair',
      startsOn: '2026-10-25',
      batchId: science,
    });
    await mk(A, '/calendar/events', { title: 'Last month', startsOn: '2026-09-01' });
    const link = await A.call('POST', `/students/${asha}/parent-link`, {});
    const view = await h.app.inject({
      method: 'POST',
      url: '/api/parent',
      payload: { token: link.body.token },
    });
    expect(view.json().upcoming).toEqual([
      {
        title: 'Maths PTM',
        kind: 'meeting',
        startsOn: '2026-10-24',
        endsOn: '2026-10-24',
        notes: '',
      },
      {
        title: 'Diwali holidays',
        kind: 'holiday',
        startsOn: '2026-11-07',
        endsOn: '2026-11-10',
        notes: '',
      },
    ]);
  });

  it('keeps every centre to its own calendar', async () => {
    const id = await mk(A, '/calendar/events', {
      title: 'Holiday',
      kind: 'holiday',
      startsOn: '2026-10-15',
    });
    expect(
      (await B.call('GET', '/calendar?from=2026-10-01&to=2026-10-31')).body.events,
    ).toHaveLength(0);
    expect((await B.call('GET', `/calendar/events/${id}`)).status).toBe(404);
    expect((await B.call('PATCH', `/calendar/events/${id}`, { title: 'x' })).status).toBe(404);
    expect((await B.call('DELETE', `/calendar/events/${id}`)).status).toBe(404);
    expect(
      (
        await B.call('POST', '/calendar/events', {
          title: 'x',
          startsOn: '2026-10-15',
          batchId: maths,
        })
      ).body.error,
    ).toBe('unknown_batch');
  });
});
