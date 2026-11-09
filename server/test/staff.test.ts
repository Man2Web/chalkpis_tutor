import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_INVITES_PER_DAY, MAX_STAFF } from '../src/staff/service.js';
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
  h.provider.sent.length = 0;
  A = await h.tenant('+919876543210', { institute: 'Alpha' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const TODAY = '2026-10-08';
const batch = (over = {}) => ({
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['thu'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
  ...over,
});
const student = (over = {}) => ({
  name: 'Asha Rao',
  parentPhone: '9876500001',
  monthlyFee: 100000,
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
/** Owner invites a person; returns a caller acting as them (not in the centre until they accept). */
const invited = async (
  owner: Tenant,
  phone: string,
  batchIds: string[] = [],
  name = 'Helper One',
) => {
  const r = await owner.call('POST', '/staff', { phone, name, batchIds });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return h.login(r.body.id as string, '');
};
/** Owner invites a helper and they accept; returns a caller acting as that helper. */
const invite = async (owner: Tenant, phone: string, batchIds: string[] = [], name?: string) => {
  const person = await invited(owner, phone, batchIds, name);
  const r = await person.call('POST', `/me/invites/${owner.instituteId}/accept`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return h.login(person.userId, owner.instituteId);
};

describe('inviting and managing staff', () => {
  it('the owner invites a helper by phone, assigns batches, and the list shows them', async () => {
    const b1 = await mk(A, '/batches', batch());
    const b2 = await mk(A, '/batches', batch({ name: 'Science 10' }));
    const staff = await invite(A, '98765 11111', [b1, b2]);
    const list = (await A.call('GET', '/staff')).body.staff;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: staff.userId,
      phone: '+919876511111',
      name: 'Helper One',
      status: 'active',
    });
    expect(list[0].batchIds.sort()).toEqual([b1, b2].sort());
    expect((await staff.call('GET', '/me')).body).toMatchObject({
      invites: [],
      membership: { instituteId: A.instituteId, role: 'staff', onboardingDone: true },
    });
  });

  it('an invite joins nothing: the person sees "Join Alpha?" and is in only after accepting', async () => {
    const b1 = await mk(A, '/batches', batch());
    const person = await invited(A, '9876511111', [b1]);
    expect((await A.call('GET', '/staff')).body.staff).toEqual([
      expect.objectContaining({ id: person.userId, status: 'invited', batchIds: [b1] }),
    ]);
    const me = (await person.call('GET', '/me')).body;
    expect(me.membership).toBeNull();
    expect(me.invites).toEqual([
      {
        instituteId: A.instituteId,
        centreName: 'Alpha',
        ownerName: expect.any(String),
        invitedAt: expect.any(String),
      },
    ]);
    expect((await person.call('GET', '/batches')).status).toBe(403); // not in the centre yet
    expect((await person.call('POST', `/me/invites/${A.instituteId}/accept`)).status).toBe(200);
    expect((await person.call('GET', '/me')).body).toMatchObject({
      invites: [],
      membership: { instituteId: A.instituteId, role: 'staff', onboardingDone: true },
    });
    expect(
      (await person.call('GET', '/batches')).body.batches.map((x: { id: string }) => x.id),
    ).toEqual([b1]);
    expect((await A.call('GET', '/staff')).body.staff[0]).toMatchObject({
      status: 'active',
      batchIds: [b1],
    });
    // accepting twice: the invite is gone
    expect((await person.call('POST', `/me/invites/${A.instituteId}/accept`)).status).toBe(404);
  });

  it('declining drops the invite, and the person can still set up a centre of their own', async () => {
    const person = await invited(A, '9876511111');
    expect((await person.call('DELETE', `/me/invites/${A.instituteId}`)).status).toBe(200);
    expect((await person.call('GET', '/me')).body).toMatchObject({ invites: [], membership: null });
    expect((await A.call('GET', '/staff')).body.staff).toEqual([]);
    expect((await person.call('POST', `/me/invites/${A.instituteId}/accept`)).status).toBe(404);
    expect(
      (
        await person.call('POST', '/institutes', {
          tutorName: 'Helper One',
          instituteName: 'Own Classes',
          category: 'tuition',
          language: 'en',
        })
      ).status,
    ).toBe(201);
  });

  it('someone who already has a centre must leave it before accepting', async () => {
    await invited(B, '9876543210'); // A's owner, invited to Beta
    expect((await A.call('GET', '/me')).body.invites).toEqual([]); // not shown inside a centre
    const r = await A.call('POST', `/me/invites/${B.instituteId}/accept`);
    expect([r.status, r.body.error]).toEqual([409, 'has_centre']);
    expect((await A.call('GET', '/me')).body.membership).toMatchObject({
      instituteId: A.instituteId,
      role: 'owner',
    });
  });

  it('an invite can be accepted only by the invited person, and only for a real invite', async () => {
    await invited(A, '9876511111');
    const stranger = await invited(B, '9876522222');
    expect((await stranger.call('POST', `/me/invites/${A.instituteId}/accept`)).status).toBe(404);
    expect((await stranger.call('POST', '/me/invites/not-an-id/accept')).status).toBe(400);
    expect(
      (await h.app.inject({ method: 'POST', url: `/me/invites/${A.instituteId}/accept` }))
        .statusCode,
    ).toBe(401);
    expect((await A.call('GET', '/staff')).body.staff[0].status).toBe('invited');
  });

  it('batches changed or deleted before the person accepts: they get what is left', async () => {
    const b1 = await mk(A, '/batches', batch());
    const b2 = await mk(A, '/batches', batch({ name: 'Science 10' }));
    const person = await invited(A, '9876511111', [b1]);
    expect(
      (await A.call('PUT', `/staff/${person.userId}/batches`, { batchIds: [b1, b2] })).status,
    ).toBe(200);
    expect((await A.call('GET', '/staff')).body.staff[0].batchIds.sort()).toEqual([b1, b2].sort());
    await h.db.pool.query('DELETE FROM batches WHERE id = ?', [b2]);
    await person.call('POST', `/me/invites/${A.instituteId}/accept`);
    expect((await A.call('GET', '/staff')).body.staff[0].batchIds).toEqual([b1]);
  });

  it('the owner can cancel an invite before it is answered', async () => {
    const person = await invited(A, '9876511111');
    expect((await A.call('DELETE', `/staff/${person.userId}`)).status).toBe(200);
    expect((await person.call('GET', '/me')).body.invites).toEqual([]);
    expect((await person.call('POST', `/me/invites/${A.instituteId}/accept`)).status).toBe(404);
  });

  it('an expired plan cannot be joined', async () => {
    const person = await invited(A, '9876511111');
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const late = h.login(person.userId, '');
    const r = await late.call('POST', `/me/invites/${A.instituteId}/accept`);
    expect([r.status, r.body.error]).toEqual([402, 'plan_expired']);
  });

  it('a helper can leave the centre; an owner cannot leave their own', async () => {
    const b = await mk(A, '/batches', batch());
    const staff = await invite(A, '9876511111', [b]);
    expect((await staff.call('POST', '/me/leave')).status).toBe(200);
    expect((await staff.call('GET', '/me')).body.membership).toBeNull();
    expect((await staff.call('GET', '/batches')).status).toBe(403);
    expect((await A.call('GET', '/staff')).body.staff).toEqual([]);
    expect((await staff.call('POST', '/me/leave')).status).toBe(404);
    const r = await A.call('POST', '/me/leave');
    expect([r.status, r.body.error]).toEqual([400, 'owner_cannot_leave']);
  });

  it('the person signs in with the usual WhatsApp code and is asked to join', async () => {
    await A.call('POST', '/staff', { phone: '9876511111', name: 'Helper One' });
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: '/auth/otp/request',
          payload: { phone: '9876511111' },
        })
      ).statusCode,
    ).toBe(200);
    const code = h.provider.sent[h.provider.sent.length - 1]!.vars[0]!;
    const v = await h.app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phone: '9876511111', code },
    });
    expect(v.statusCode).toBe(200);
    expect(v.json()).toMatchObject({
      user: { name: 'Helper One', phone: '+919876511111' },
      invites: [{ instituteId: A.instituteId, centreName: 'Alpha' }],
      membership: null,
    });
  });

  it("validates input and refuses batches that are not this institute's", async () => {
    const bB = await mk(B, '/batches', batch({ name: 'Beta Batch' }));
    for (const bad of [
      {},
      { phone: '123', name: 'Helper One' },
      { phone: '9876511111', name: 'H' },
      { phone: '9876511111', name: 'Helper One', batchIds: ['nope'] },
    ])
      expect((await A.call('POST', '/staff', bad)).status).toBe(400);
    expect(
      (await A.call('POST', '/staff', { phone: '9876511111', name: 'Helper One', batchIds: [bB] }))
        .body.error,
    ).toBe('unknown_batch');
    expect((await A.call('GET', '/staff')).body.staff).toEqual([]); // nothing half-created
    expect(
      (
        (await h.db.pool.query(
          "SELECT COUNT(*) AS n FROM users WHERE phone = '+919876511111'",
        )) as unknown as [{ n: number }[]]
      )[0][0]!.n,
    ).toBe(0);
  });

  it("only this centre's own people are refused; another centre's look like anyone else", async () => {
    expect(
      (await A.call('POST', '/staff', { phone: '9876543210', name: 'The Owner' })).body.error,
    ).toBe('already_member'); // the owner's own number
    await invite(A, '9876511111');
    expect(
      (await A.call('POST', '/staff', { phone: '9876511111', name: 'Again' })).body.error,
    ).toBe('already_member'); // already a helper here
    await invited(A, '9876522222');
    expect(
      (await A.call('POST', '/staff', { phone: '9876522222', name: 'Again' })).body.error,
    ).toBe('already_member'); // already invited here
    // B's owner, A's helper and a number nobody uses all get the same answer from B: nothing tells B who uses the app
    const answers = [];
    for (const phone of ['9876543210', '9876511111', '9876533333']) {
      const r = await B.call('POST', '/staff', { phone, name: 'Someone' });
      answers.push([r.status, Object.keys(r.body)]);
    }
    expect(answers).toEqual(Array(3).fill([201, ['id']]));
    expect(
      (await B.call('GET', '/staff')).body.staff.map((s: { status: string; name: string }) => [
        s.status,
        s.name,
      ]),
    ).toEqual(Array(3).fill(['invited', 'Someone']));
    // ...and nothing changed for them in A
    expect((await A.call('GET', '/me')).body.membership.role).toBe('owner');
    expect(
      (await A.call('GET', '/staff')).body.staff.map((s: { status: string }) => s.status).sort(),
    ).toEqual(['active', 'invited']);
  });

  it("a person who already signed up is shown by the owner's name for them, not their own", async () => {
    await h.db.pool.query(
      "INSERT INTO users (id, phone, name) VALUES (UUID(), '+919876522222', 'Existing Person')",
    );
    const r = await A.call('POST', '/staff', { phone: '9876522222', name: 'Typed Name' });
    expect(r.status).toBe(201);
    expect((await A.call('GET', '/staff')).body.staff[0]).toMatchObject({
      phone: '+919876522222',
      name: 'Typed Name',
      status: 'invited',
    }); // their own name would tell the owner the number already uses the app
    const [[u]] = (await h.db.pool.query(
      "SELECT name FROM users WHERE phone = '+919876522222'",
    )) as unknown as [[{ name: string }]];
    expect(u.name).toBe('Existing Person'); // and their own name is kept
  });

  it(`allows at most ${MAX_STAFF} helpers, even when invited at the same moment`, async () => {
    const rs = await Promise.all(
      Array.from({ length: MAX_STAFF + 3 }, (_, i) =>
        A.call('POST', '/staff', { phone: `98765${String(30000 + i)}`, name: `Helper ${i}` }),
      ),
    );
    expect(rs.filter((r) => r.status === 201)).toHaveLength(MAX_STAFF);
    expect(rs.filter((r) => r.status === 402).every((r) => r.body.error === 'staff_limit')).toBe(
      true,
    );
  });

  it(`adding and removing helpers cannot send more than ${MAX_INVITES_PER_DAY} invites a day`, async () => {
    for (let i = 0; i < MAX_INVITES_PER_DAY; i++) {
      const r = await A.call('POST', '/staff', { phone: `98765${40000 + i}`, name: `Helper ${i}` });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect((await A.call('DELETE', `/staff/${r.body.id}`)).status).toBe(200);
    }
    const r = await A.call('POST', '/staff', { phone: '9876549999', name: 'One more' });
    expect([r.status, r.body.error]).toEqual([429, 'too_many_invites']);
    // another centre is not affected, and the next day it works again
    expect((await B.call('POST', '/staff', { phone: '9876549998', name: 'Other' })).status).toBe(
      201,
    );
    h.clock.now = new Date(h.clock.now.getTime() + 86_400_000 + 1000);
    const later = h.login(A.userId, A.instituteId); // a fresh sign-in: yesterday's access token has expired
    expect(
      (await later.call('POST', '/staff', { phone: '9876549999', name: 'One more' })).status,
    ).toBe(201);
  });

  it('assigned batches can be replaced, and the database refuses a batch of another institute', async () => {
    const b1 = await mk(A, '/batches', batch());
    const b2 = await mk(A, '/batches', batch({ name: 'Science 10' }));
    const bB = await mk(B, '/batches', batch({ name: 'Beta Batch' }));
    const staff = await invite(A, '9876511111', [b1]);
    expect((await A.call('PUT', `/staff/${staff.userId}/batches`, { batchIds: [b2] })).status).toBe(
      200,
    );
    expect((await A.call('GET', '/staff')).body.staff[0].batchIds).toEqual([b2]);
    expect((await A.call('PUT', `/staff/${staff.userId}/batches`, { batchIds: [] })).status).toBe(
      200,
    );
    expect((await A.call('GET', '/staff')).body.staff[0].batchIds).toEqual([]);
    expect(
      (await A.call('PUT', `/staff/${staff.userId}/batches`, { batchIds: [bB] })).body.error,
    ).toBe('unknown_batch');
    await expect(
      h.db.pool.query(
        'INSERT INTO staff_batches (institute_id, user_id, batch_id) VALUES (?, ?, ?)',
        [A.instituteId, staff.userId, bB],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('removing a helper ends their access at once, keeps their login, and clears their assignments', async () => {
    const b = await mk(A, '/batches', batch());
    const staff = await invite(A, '9876511111', [b]);
    expect((await staff.call('GET', '/batches')).body.batches).toHaveLength(1);
    expect((await A.call('DELETE', `/staff/${staff.userId}`)).status).toBe(200);
    expect((await staff.call('GET', '/batches')).status).toBe(403); // the same token no longer reaches anything
    expect((await staff.call('GET', '/me')).body.membership).toBeNull();
    expect(
      (
        (await h.db.pool.query('SELECT COUNT(*) AS n FROM staff_batches')) as unknown as [
          { n: number }[],
        ]
      )[0][0]!.n,
    ).toBe(0);
    expect(
      (
        (await h.db.pool.query('SELECT COUNT(*) AS n FROM users WHERE id = ?', [
          staff.userId,
        ])) as unknown as [{ n: number }[]]
      )[0][0]!.n,
    ).toBe(1);
    expect((await A.call('DELETE', `/staff/${staff.userId}`)).status).toBe(404); // already gone
  });

  it("only the owner manages staff, and nobody manages another institute's staff", async () => {
    const staff = await invite(A, '9876511111');
    for (const [m, u, body] of [
      ['GET', '/staff'],
      ['POST', '/staff', { phone: '9876522222', name: 'Another One' }],
      ['PUT', `/staff/${staff.userId}/batches`, { batchIds: [] }],
      ['DELETE', `/staff/${staff.userId}`],
    ] as const)
      expect([m, u, (await staff.call(m, u, body)).status]).toEqual([m, u, 403]);
    expect((await B.call('GET', '/staff')).body.staff).toEqual([]);
    expect((await B.call('PUT', `/staff/${staff.userId}/batches`, { batchIds: [] })).status).toBe(
      404,
    );
    expect((await B.call('DELETE', `/staff/${staff.userId}`)).status).toBe(404);
    expect((await A.call('DELETE', `/staff/${A.userId}`)).status).toBe(404); // the owner is not staff
    expect((await h.app.inject({ method: 'GET', url: '/staff' })).statusCode).toBe(401);
  });

  it('an expired plan cannot add helpers or change assignments, but can still remove them', async () => {
    const staff = await invite(A, '9876511111');
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const owner = h.login(A.userId, A.instituteId);
    expect(
      (await owner.call('POST', '/staff', { phone: '9876522222', name: 'Another One' })).body.error,
    ).toBe('plan_expired');
    expect(
      (await owner.call('PUT', `/staff/${staff.userId}/batches`, { batchIds: [] })).body.error,
    ).toBe('plan_expired');
    expect((await owner.call('DELETE', `/staff/${staff.userId}`)).status).toBe(200);
  });
});

describe('what a helper can do', () => {
  let b: string;
  let other: string;
  let s1: string;
  let s2: string;
  let sOther: string;
  let staff: Tenant;
  beforeEach(async () => {
    b = await mk(A, '/batches', batch());
    other = await mk(A, '/batches', batch({ name: 'Other Batch' }));
    s1 = await mk(A, '/students', student({ batchIds: [b] }));
    s2 = await mk(
      A,
      '/students',
      student({ name: 'Bala K', parentPhone: '9876500002', batchIds: [b] }),
    );
    sOther = await mk(
      A,
      '/students',
      student({ name: 'Hidden Kid', parentPhone: '9876500003', batchIds: [other] }),
    );
    staff = await invite(A, '9876511111', [b]);
  });

  it("sees the centre's name, logo and city only, not the owner's details or payment settings", async () => {
    await A.call('PATCH', '/institute', { upiId: 'alpha@oksbi', address: '12 Main Road' });
    await A.call('PUT', '/institute/details', {
      email: 'owner@example.com',
      city: 'Mysore',
      state: 'Karnataka',
      pincode: '570001',
      heardFrom: 'google',
    });
    const mine = (await A.call('GET', '/institute')).body;
    expect(mine).toMatchObject({ upiId: 'alpha@oksbi', details: { email: 'owner@example.com' } });
    const seen = (await staff.call('GET', '/institute')).body;
    expect(Object.keys(seen).sort()).toEqual(
      ['category', 'city', 'createdAt', 'currency', 'logoUrl', 'name', 'timezone'].sort(),
    );
    expect(seen).toMatchObject({ name: mine.name, city: 'Mysore' });
  });

  it("sees names and photos, never the family's phone numbers, notes or fees", async () => {
    const list = (await staff.call('GET', '/students?status=all')).body.students as Record<
      string,
      unknown
    >[];
    expect(list.map((s) => s.name).sort()).toEqual(['Asha Rao', 'Bala K']);
    for (const s of list)
      expect(s).toMatchObject({ parentPhone: '', phone: '', notes: '', dob: '', monthlyFee: 0 });
    expect((await staff.call('GET', `/students/${s1}`)).body).toMatchObject({
      name: 'Asha Rao',
      parentPhone: '',
      monthlyFee: 0,
    });
    expect((await staff.call('GET', '/batches')).body.batches[0]).toMatchObject({ defaultFee: 0 });
    expect((await staff.call('GET', `/batches/${b}`)).body).toMatchObject({ defaultFee: 0 });
    // the owner still sees everything
    expect((await A.call('GET', `/students/${s1}`)).body).toMatchObject({
      parentPhone: '+919876500001',
      monthlyFee: 100000,
    });
  });

  it('takes attendance for an assigned batch, and the owner sees it', async () => {
    expect(
      (
        await staff.call('PUT', '/attendance', {
          batchId: b,
          date: TODAY,
          marks: { [s1]: 'P', [s2]: 'A' },
        })
      ).status,
    ).toBe(200);
    expect((await staff.call('GET', `/attendance?batchId=${b}&date=${TODAY}`)).body.marks).toEqual({
      [s1]: 'P',
      [s2]: 'A',
    });
    expect((await A.call('GET', `/attendance?batchId=${b}&date=${TODAY}`)).body.marks).toEqual({
      [s1]: 'P',
      [s2]: 'A',
    });
    const [[row]] = (await h.db.pool.query(
      'SELECT marked_by FROM attendance_days WHERE batch_id = ?',
      [b],
    )) as unknown as [[{ marked_by: string }]];
    expect(row.marked_by).toBe(staff.userId); // the log says who marked it
  });

  it('cannot touch a batch that is not assigned, and it looks like a missing one', async () => {
    for (const [m, u, body] of [
      ['PUT', '/attendance', { batchId: other, date: TODAY, marks: {} }],
      ['GET', `/attendance?batchId=${other}&date=${TODAY}`],
      ['GET', `/attendance/range?from=${TODAY}&to=${TODAY}&batchId=${other}`],
      ['GET', `/attendance/report?from=${TODAY}&to=${TODAY}&batchId=${other}`],
      ['GET', `/batches/${other}`],
      ['GET', `/students/${sOther}`],
      ['GET', `/students/${sOther}/attendance?from=${TODAY}&to=${TODAY}`],
    ] as const) {
      const r = await staff.call(m, u, body);
      expect([m, u, r.status, r.body]).toEqual([m, u, 404, { error: 'not_found' }]);
    }
    expect(
      (await staff.call('GET', '/students?status=all')).body.students
        .map((x: { id: string }) => x.id)
        .sort(),
    ).toEqual([s1, s2].sort());
    expect(
      (await staff.call('GET', '/batches?status=all')).body.batches.map(
        (x: { id: string }) => x.id,
      ),
    ).toEqual([b]);
  });

  it('range, report and history show only the assigned batches', async () => {
    await A.call('PUT', '/attendance', { batchId: b, date: TODAY, marks: { [s1]: 'P' } });
    await A.call('PUT', '/attendance', { batchId: other, date: TODAY, marks: { [sOther]: 'A' } });
    const range = (await staff.call('GET', `/attendance/range?from=${TODAY}&to=${TODAY}`)).body
      .days;
    expect(range.map((d: { batchId: string }) => d.batchId)).toEqual([b]);
    const report = (await staff.call('GET', `/attendance/report?from=${TODAY}&to=${TODAY}`)).body;
    expect(report.students.map((x: { studentId: string }) => x.studentId)).toEqual([s1]);
    expect(
      (await A.call('GET', `/attendance/report?from=${TODAY}&to=${TODAY}`)).body.students,
    ).toHaveLength(2); // the owner sees both
    expect(
      (await staff.call('GET', `/students/${s1}/attendance?from=${TODAY}&to=${TODAY}`)).body.days,
    ).toHaveLength(1);
  });

  it('can only mark today and yesterday, and only students who are in the batch', async () => {
    expect(
      (
        await staff.call('PUT', '/attendance', {
          batchId: b,
          date: '2026-10-07',
          marks: { [s1]: 'P' },
        })
      ).status,
    ).toBe(200);
    const old = await staff.call('PUT', '/attendance', {
      batchId: b,
      date: '2026-10-06',
      marks: { [s1]: 'P' },
    });
    expect([old.status, old.body.error]).toEqual([403, 'staff_date_limit']);
    expect(
      (await A.call('PUT', '/attendance', { batchId: b, date: '2026-10-06', marks: { [s1]: 'P' } }))
        .status,
    ).toBe(200); // the owner can edit old days
    expect(
      (
        await staff.call('PUT', '/attendance', {
          batchId: b,
          date: TODAY,
          marks: { [sOther]: 'A' },
        })
      ).body.error,
    ).toBe('unknown_student');
    expect(
      (await staff.call('PUT', '/attendance', { batchId: b, date: '2026-10-09', marks: {} })).body
        .error,
    ).toBe('future_date');
  });

  it('parents are still told when a helper marks a student absent', async () => {
    await A.call('PUT', '/settings/notifications', {
      enabled: true,
      absent: true,
      late: true,
      feeDue: true,
      feeDueDaysBefore: 2,
      feeOverdue: true,
      overdueEveryDays: 7,
      paymentReceived: true,
      language: 'en',
    });
    await staff.call('PUT', '/attendance', { batchId: b, date: TODAY, marks: { [s1]: 'A' } });
    expect(
      (
        (await h.db.pool.query(
          "SELECT COUNT(*) AS n FROM messages WHERE type = 'absent'",
        )) as unknown as [{ n: number }[]]
      )[0][0]!.n,
    ).toBe(1);
  });

  it('cannot see money, messages, billing or parent links, and cannot change people or classes', async () => {
    for (const u of [
      '/dashboard',
      '/fees/overview',
      '/fees/dues',
      '/fees/payments',
      '/reports/fees?from=2026-10-01&to=2026-10-31',
      '/messages',
      '/settings/notifications',
      '/billing',
      '/billing/plans',
      `/students/${s1}/parent-link`,
    ])
      expect([u, (await staff.call('GET', u)).status]).toEqual([u, 403]);
    for (const [m, u, body] of [
      ['POST', '/students', student({ name: 'New Kid' })],
      ['PATCH', `/students/${s1}`, { name: 'X' }],
      ['POST', '/batches', batch({ name: 'New' })],
      ['POST', `/batches/${b}/students`, { studentIds: [s1] }],
      ['POST', `/students/${s1}/parent-link`, {}],
      ['PUT', '/institute/logo'],
    ] as const)
      expect([m, u, (await staff.call(m, u, body)).status]).toEqual([m, u, 403]);
  });

  it('an expired plan stops attendance too, like every other write', async () => {
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const late = h.login(staff.userId, A.instituteId);
    const r = await late.call('PUT', '/attendance', {
      batchId: b,
      date: '2026-10-15',
      marks: { [s1]: 'P' },
    });
    expect([r.status, r.body.error]).toEqual([402, 'plan_expired']);
  });

  it('staff of one institute cannot reach another institute at all', async () => {
    const bB = await mk(B, '/batches', batch({ name: 'Beta Batch' }));
    expect((await staff.call('GET', `/batches/${bB}`)).status).toBe(404);
    expect(
      (await staff.call('PUT', '/attendance', { batchId: bB, date: TODAY, marks: {} })).status,
    ).toBe(404);
  });
});
