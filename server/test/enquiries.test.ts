import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;
let batchId: string;

const batch = {
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['mon'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
};
const enquiry = (over = {}) => ({
  name: 'Kavya',
  parentName: 'Mrs Lakshmi',
  phone: '98765 43210',
  class: '9',
  interest: 'Maths and Science',
  source: 'walk_in',
  ...over,
});

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
  batchId = (await A.call('POST', '/batches', batch)).body.id;
});

describe('enquiries and admissions', () => {
  it('adds an enquiry with a first note and lists it with the counts', async () => {
    const r = await A.call('POST', '/enquiries', enquiry({ batchId, note: 'Wants evening batch' }));
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const list = (await A.call('GET', '/enquiries')).body;
    expect(list.enquiries[0]).toMatchObject({
      name: 'Kavya',
      phone: '+919876543210',
      batchName: 'Maths 10',
      status: 'new',
      notes: 1,
      lastNote: 'Wants evening batch',
    });
    expect(list.counts).toMatchObject({ new: 1, follow_up: 0, joined: 0 });
    expect(list.thisMonth).toEqual({ enquiries: 1, joined: 0 });
  });

  it('refuses a bad phone number or a batch from another centre', async () => {
    expect((await A.call('POST', '/enquiries', enquiry({ phone: '12345' }))).status).toBe(400);
    const theirs = (await B.call('POST', '/batches', batch)).body.id;
    expect((await A.call('POST', '/enquiries', enquiry({ batchId: theirs }))).body.error).toBe(
      'unknown_batch',
    );
  });

  it('counts follow-ups that are due, and clears the follow-up once the enquiry is closed', async () => {
    // the harness clock is 2026-10-08
    const due = (await A.call('POST', '/enquiries', enquiry({ nextFollowUp: '2026-10-08' }))).body
      .id;
    await A.call('POST', '/enquiries', enquiry({ name: 'Later', nextFollowUp: '2026-10-20' }));
    let list = (await A.call('GET', '/enquiries')).body;
    expect(list.dueFollowUps).toBe(1);
    // a follow-up day set at the start puts it in Follow-up, soonest first
    expect(list.enquiries.map((e: { name: string }) => e.name)).toEqual(['Kavya', 'Later']);
    expect(list.enquiries[0].status).toBe('follow_up');
    await A.call('PATCH', `/enquiries/${due}`, { status: 'lost', lostReason: 'Too far' });
    list = (await A.call('GET', '/enquiries')).body;
    expect(list.dueFollowUps).toBe(0);
    const lost = (await A.call('GET', `/enquiries/${due}`)).body.enquiry;
    expect(lost).toMatchObject({ status: 'lost', lostReason: 'Too far', nextFollowUp: null });
    expect((await A.call('GET', '/enquiries?status=lost')).body.enquiries).toHaveLength(1);
  });

  it('keeps a log of follow-up notes, newest first', async () => {
    const id = (await A.call('POST', '/enquiries', enquiry())).body.id;
    await A.call('POST', `/enquiries/${id}/notes`, { note: 'Called, no answer' });
    h.clock.now = new Date(h.clock.now.getTime() + 60_000);
    await A.call('POST', `/enquiries/${id}/notes`, { note: 'Coming for a trial on Monday' });
    const got = (await A.call('GET', `/enquiries/${id}`)).body;
    expect(got.notes.map((n: { note: string }) => n.note)).toEqual([
      'Coming for a trial on Monday',
      'Called, no answer',
    ]);
  });

  it('turns an enquiry into a student, once', async () => {
    const id = (await A.call('POST', '/enquiries', enquiry())).body.id;
    const r = await A.call('POST', `/enquiries/${id}/convert`, {
      name: 'Kavya',
      parentName: 'Mrs Lakshmi',
      parentPhone: '9876543210',
      class: '9',
      monthlyFee: 150000,
      batchIds: [batchId],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const student = (await A.call('GET', `/students/${r.body.studentId}`)).body;
    expect(student).toMatchObject({ name: 'Kavya', class: '9', batchIds: [batchId] });
    const e = (await A.call('GET', `/enquiries/${id}`)).body.enquiry;
    expect(e).toMatchObject({ status: 'joined', studentId: r.body.studentId });
    expect((await A.call('GET', '/enquiries')).body.thisMonth).toEqual({ enquiries: 1, joined: 1 });
    const again = await A.call('POST', `/enquiries/${id}/convert`, {
      name: 'Kavya',
      parentPhone: '9876543210',
    });
    expect(again.body.error).toBe('already_joined');
  });

  it('keeps every centre to its own enquiries', async () => {
    const id = (await A.call('POST', '/enquiries', enquiry())).body.id;
    expect((await B.call('GET', '/enquiries')).body.enquiries).toHaveLength(0);
    expect((await B.call('GET', `/enquiries/${id}`)).status).toBe(404);
    expect((await B.call('PATCH', `/enquiries/${id}`, { status: 'lost' })).status).toBe(404);
    expect((await B.call('POST', `/enquiries/${id}/notes`, { note: 'x' })).status).toBe(404);
    expect(
      (
        await B.call('POST', `/enquiries/${id}/convert`, {
          name: 'Kavya',
          parentPhone: '9876543210',
        })
      ).status,
    ).toBe(404);
    expect((await B.call('DELETE', `/enquiries/${id}`)).status).toBe(404);
    expect((await A.call('DELETE', `/enquiries/${id}`)).status).toBe(200);
    expect((await A.call('GET', '/enquiries')).body.enquiries).toHaveLength(0);
  });
});
