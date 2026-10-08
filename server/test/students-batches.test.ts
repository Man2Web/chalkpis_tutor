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

const batch = (over = {}) => ({
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['wed', 'mon'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
  ...over,
});
const student = (over = {}) => ({
  name: 'Asha Rao',
  parentName: 'Mr Rao',
  parentPhone: '98765 43210',
  class: '10',
  monthlyFee: 150000,
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) =>
  (await t.call('POST', path, body)).body.id as string;
const limits = (t: Tenant, s: number | null, b: number | null) =>
  h.db.pool.query(
    "UPDATE subscriptions SET plan = 'starter', student_limit = ?, batch_limit = ? WHERE institute_id = ?",
    [s, b, t.instituteId],
  );

describe('batches', () => {
  it('create, read, list and update, with days kept in week order and the count of active students', async () => {
    const r = await A.call('POST', '/batches', batch());
    expect(r.status).toBe(201);
    const id = r.body.id as string;
    expect((await A.call('GET', `/batches/${id}`)).body).toMatchObject({
      name: 'Maths 10',
      days: ['mon', 'wed'],
      startTime: '17:00',
      defaultFee: 150000,
      status: 'active',
      studentCount: 0,
    });
    const s1 = await mk(A, '/students', student({ batchIds: [id] }));
    await mk(A, '/students', student({ name: 'Bala K', batchIds: [id] }));
    await A.call('POST', `/students/${s1}/deactivate`);
    expect((await A.call('GET', `/batches/${id}`)).body.studentCount).toBe(1); // only active students count
    expect(
      (await A.call('PATCH', `/batches/${id}`, { name: 'Maths 10 B', defaultFee: 200000 })).status,
    ).toBe(200);
    expect((await A.call('GET', '/batches')).body.batches).toMatchObject([
      { name: 'Maths 10 B', defaultFee: 200000 },
    ]);
  });

  it('validates input', async () => {
    for (const bad of [
      {},
      batch({ name: 'x' }),
      batch({ days: [] }),
      batch({ days: ['funday'] }),
      batch({ startTime: '25:00' }),
      batch({ endTime: '16:00' }),
      batch({ defaultFee: -1 }),
      batch({ defaultFee: 1.5 }),
      batch({ defaultFee: '100' }),
    ]) {
      expect((await A.call('POST', '/batches', bad)).status).toBe(400);
    }
    const id = await mk(A, '/batches', batch());
    expect((await A.call('PATCH', `/batches/${id}`, {})).status).toBe(400);
    expect((await A.call('PATCH', `/batches/${id}`, { endTime: '16:00' })).status).toBe(400); // end must stay after start
  });

  it('archive keeps the batch and its students; restore brings it back', async () => {
    const id = await mk(A, '/batches', batch());
    await A.call('POST', '/students', student({ batchIds: [id] }));
    await A.call('POST', `/batches/${id}/archive`);
    expect((await A.call('GET', '/batches')).body.batches).toEqual([]);
    expect((await A.call('GET', '/batches?status=archived')).body.batches).toHaveLength(1);
    expect((await A.call('GET', '/students')).body.students[0].batchIds).toEqual([id]);
    await A.call('POST', `/batches/${id}/restore`);
    expect((await A.call('GET', '/batches')).body.batches).toHaveLength(1);
  });

  it('add and remove students; a student can be in several batches', async () => {
    const b1 = await mk(A, '/batches', batch());
    const b2 = await mk(A, '/batches', batch({ name: 'Science 10', subject: 'Science' }));
    const s = await mk(A, '/students', student());
    expect((await A.call('POST', `/batches/${b1}/students`, { studentIds: [s] })).status).toBe(200);
    expect((await A.call('POST', `/batches/${b2}/students`, { studentIds: [s, s] })).status).toBe(
      200,
    ); // duplicates and repeats are fine
    expect((await A.call('POST', `/batches/${b2}/students`, { studentIds: [s] })).status).toBe(200);
    expect((await A.call('GET', `/students/${s}`)).body.batchIds.sort()).toEqual([b1, b2].sort());
    await A.call('DELETE', `/batches/${b1}/students/${s}`);
    expect((await A.call('GET', `/students/${s}`)).body.batchIds).toEqual([b2]);
  });
});

describe('students', () => {
  it('create and read back with the phone normalised and batches linked', async () => {
    const b = await mk(A, '/batches', batch());
    const r = await A.call(
      'POST',
      '/students',
      student({ phone: '098765-43211', batchIds: [b], notes: 'sits at the front' }),
    );
    expect(r.status).toBe(201);
    expect((await A.call('GET', `/students/${r.body.id}`)).body).toMatchObject({
      name: 'Asha Rao',
      parentPhone: '+919876543210',
      phone: '+919876543211',
      status: 'active',
      feeCycle: 'monthly',
      dueDay: 1,
      discount: 0,
      notifyParent: true,
      monthlyFee: 150000,
      batchIds: [b],
      notes: 'sits at the front',
      photoUrl: null,
    });
  });

  it('only a name and a valid parent number are required', async () => {
    expect(
      (await A.call('POST', '/students', { name: 'Min Student', parentPhone: '9123456789' }))
        .status,
    ).toBe(201);
  });

  it('validates input', async () => {
    const bad = [
      {},
      student({ name: 'A' }),
      student({ parentPhone: '12345' }),
      student({ parentPhone: undefined }),
      student({ phone: '123' }),
      student({ monthlyFee: -5 }),
      student({ monthlyFee: 10.5 }),
      student({ dueDay: 0 }),
      student({ dueDay: 32 }),
      student({ feeCycle: 'weekly' }),
      student({ batchIds: ['not-a-uuid'] }),
      student({ notes: 'x'.repeat(501) }),
      student({ notifyParent: 'yes' }),
    ];
    for (const b of bad) expect((await A.call('POST', '/students', b)).status).toBe(400);
  });

  it('SQL text in fields is stored as plain text', async () => {
    const id = await mk(A, '/students', student({ name: "Robert'); DROP TABLE students;--" }));
    expect((await A.call('GET', `/students/${id}`)).body.name).toBe(
      "Robert'); DROP TABLE students;--",
    );
    expect((await A.call('GET', '/students')).body.students).toHaveLength(1);
    expect((await A.call('GET', "/students/1'%20OR%20'1'='1")).status).toBe(400);
  });

  it('Hindi names round-trip', async () => {
    const id = await mk(A, '/students', student({ name: 'आशा राव' }));
    expect((await A.call('GET', `/students/${id}`)).body.name).toBe('आशा राव');
  });

  it('update changes only what is sent, and replaces batch membership when batchIds is sent', async () => {
    const b1 = await mk(A, '/batches', batch());
    const b2 = await mk(A, '/batches', batch({ name: 'English' }));
    const id = await mk(A, '/students', student({ batchIds: [b1] }));
    await A.call('PATCH', `/students/${id}`, { monthlyFee: 99900, notifyParent: false });
    expect((await A.call('GET', `/students/${id}`)).body).toMatchObject({
      name: 'Asha Rao',
      monthlyFee: 99900,
      notifyParent: false,
      batchIds: [b1],
    });
    await A.call('PATCH', `/students/${id}`, { batchIds: [b2] });
    expect((await A.call('GET', `/students/${id}`)).body.batchIds).toEqual([b2]);
    await A.call('PATCH', `/students/${id}`, { batchIds: [] });
    expect((await A.call('GET', `/students/${id}`)).body.batchIds).toEqual([]);
    expect((await A.call('PATCH', `/students/${id}`, {})).status).toBe(400);
    expect((await A.call('PATCH', `/students/${id}`, { parentPhone: '1' })).status).toBe(400);
  });

  it('deactivate and reactivate keep the student; the list filters by status and batch, sorted by name', async () => {
    const b = await mk(A, '/batches', batch());
    const x = await mk(A, '/students', student({ name: 'Zoya', batchIds: [b] }));
    await mk(A, '/students', student({ name: 'Aarav' }));
    await A.call('POST', `/students/${x}/deactivate`);
    expect(
      (await A.call('GET', '/students')).body.students.map((s: { name: string }) => s.name),
    ).toEqual(['Aarav']);
    expect(
      (await A.call('GET', '/students?status=inactive')).body.students.map(
        (s: { name: string }) => s.name,
      ),
    ).toEqual(['Zoya']);
    expect(
      (await A.call('GET', '/students?status=all')).body.students.map(
        (s: { name: string }) => s.name,
      ),
    ).toEqual(['Aarav', 'Zoya']);
    expect(
      (await A.call('GET', `/students?status=all&batchId=${b}`)).body.students.map(
        (s: { name: string }) => s.name,
      ),
    ).toEqual(['Zoya']);
    await A.call('POST', `/students/${x}/reactivate`);
    expect((await A.call('GET', '/students')).body.students).toHaveLength(2);
  });

  it('paginates', async () => {
    for (let i = 0; i < 5; i++) await mk(A, '/students', student({ name: `Student ${i}` }));
    const page = (offset: number) =>
      A.call('GET', `/students?limit=2&offset=${offset}`).then((r) =>
        r.body.students.map((s: { name: string }) => s.name),
      );
    expect(await page(0)).toEqual(['Student 0', 'Student 1']);
    expect(await page(4)).toEqual(['Student 4']);
    expect((await A.call('GET', '/students?limit=9999')).status).toBe(400);
  });

  it('a link to a batch that does not exist is refused', async () => {
    expect(
      (
        await A.call(
          'POST',
          '/students',
          student({ batchIds: ['00000000-0000-4000-8000-000000000000'] }),
        )
      ).body.error,
    ).toBe('unknown_batch');
    expect((await A.call('GET', '/students')).body.students).toEqual([]); // nothing half-created
  });

  it('bulk import is all or nothing', async () => {
    const b = await mk(A, '/batches', batch());
    const rows = [student({ name: 'One Kid', batchIds: [b] }), student({ name: 'Two Kid' })];
    const ok = await A.call('POST', '/students/bulk', { students: rows });
    expect([ok.status, ok.body.ids.length]).toEqual([201, 2]);
    const bad = await A.call('POST', '/students/bulk', {
      students: [student({ name: 'Fine Kid' }), student({ name: 'Bad Kid', parentPhone: '1' })],
    });
    expect(bad.status).toBe(400);
    expect((await A.call('GET', '/students')).body.students).toHaveLength(2); // "Fine Kid" was not added
    expect((await A.call('POST', '/students/bulk', { students: [] })).status).toBe(400);
  });
});

describe('plan limits', () => {
  it('stops at the student limit, counting only active students', async () => {
    await limits(A, 2, null);
    const a = await mk(A, '/students', student({ name: 'First Kid' }));
    await mk(A, '/students', student({ name: 'Second Kid' }));
    const third = await A.call('POST', '/students', student({ name: 'Third Kid' }));
    expect([third.status, third.body]).toEqual([
      402,
      { error: 'plan_limit', kind: 'student', limit: 2, room: 0 },
    ]);
    await A.call('POST', `/students/${a}/deactivate`);
    expect((await A.call('POST', '/students', student({ name: 'Third Kid' }))).status).toBe(201); // room again
  });

  it('refuses to reactivate over the limit', async () => {
    await limits(A, 1, null);
    const a = await mk(A, '/students', student({ name: 'First Kid' }));
    await A.call('POST', `/students/${a}/deactivate`);
    await mk(A, '/students', student({ name: 'Second Kid' }));
    expect((await A.call('POST', `/students/${a}/reactivate`)).body).toMatchObject({
      error: 'plan_limit',
    });
  });

  it('bulk import checks the whole list against the room that is left', async () => {
    await limits(A, 3, null);
    await mk(A, '/students', student({ name: 'First Kid' }));
    const r = await A.call('POST', '/students/bulk', {
      students: [
        student({ name: 'Two Kid' }),
        student({ name: 'Three Kid' }),
        student({ name: 'Four Kid' }),
      ],
    });
    expect([r.status, r.body.room]).toEqual([402, 2]);
    expect((await A.call('GET', '/students')).body.students).toHaveLength(1);
    expect(
      (
        await A.call('POST', '/students/bulk', {
          students: [student({ name: 'Two Kid' }), student({ name: 'Three Kid' })],
        })
      ).status,
    ).toBe(201);
  });

  it('simultaneous adds cannot squeeze past the limit', async () => {
    await limits(A, 3, null);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        A.call('POST', '/students', student({ name: `Racer ${i}` })),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 402)).toHaveLength(5);
    expect((await A.call('GET', '/students')).body.students).toHaveLength(3);
  });

  it('stops at the batch limit, and restoring an archived batch needs room', async () => {
    await limits(A, null, 1);
    const first = await mk(A, '/batches', batch());
    expect((await A.call('POST', '/batches', batch({ name: 'Second' }))).body).toMatchObject({
      error: 'plan_limit',
      kind: 'batch',
      limit: 1,
    });
    await A.call('POST', `/batches/${first}/archive`);
    await mk(A, '/batches', batch({ name: 'Second' }));
    expect((await A.call('POST', `/batches/${first}/restore`)).body.error).toBe('plan_limit');
  });

  it('null limits (trial, pro) mean unlimited', async () => {
    await limits(A, null, null);
    const r = await A.call('POST', '/students/bulk', {
      students: Array.from({ length: 120 }, (_, i) => student({ name: `Kid ${i}` })),
    });
    expect(r.status).toBe(201);
  });

  it('an expired plan is read-only: reads work, every write is refused', async () => {
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student());
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    A = {
      ...A,
      token: (await import('../src/lib/jwt.js')).signToken(
        A.userId,
        'test-jwt-secret-test-jwt-secret-1234',
        900,
        h.clock.now.getTime(),
      ),
    };
    const call = (m: 'GET' | 'POST' | 'PATCH' | 'DELETE', u: string, p?: unknown) =>
      h.app.inject({
        method: m,
        url: u,
        headers: { authorization: `Bearer ${A.token}` },
        ...(p === undefined ? {} : { payload: p as object }),
      });
    expect((await call('GET', '/students')).statusCode).toBe(200);
    expect((await call('GET', '/batches')).statusCode).toBe(200);
    for (const [m, u, p] of [
      ['POST', '/students', student({ name: 'Late Kid' })],
      ['PATCH', `/students/${s}`, { name: 'Changed' }],
      ['POST', `/students/${s}/deactivate`],
      ['POST', '/batches', batch({ name: 'Late' })],
      ['PATCH', `/batches/${b}`, { name: 'Changed' }],
      ['POST', `/batches/${b}/archive`],
      ['POST', `/batches/${b}/students`, { studentIds: [s] }],
      ['POST', '/students/bulk', { students: [student({ name: 'Late Kid' })] }],
    ] as const) {
      const r = await call(m, u, p);
      expect([m, u, r.statusCode, r.json().error]).toEqual([m, u, 402, 'plan_expired']);
    }
  });
});

describe('tenant isolation: B can never touch A', () => {
  let aBatch: string;
  let aStudent: string;
  beforeEach(async () => {
    aBatch = await mk(A, '/batches', batch({ name: 'Alpha Batch' }));
    aStudent = await mk(A, '/students', student({ name: 'Alpha Student', batchIds: [aBatch] }));
    await mk(B, '/students', student({ name: 'Beta Student' }));
  });
  const names = (r: { body: { students?: { name: string }[]; batches?: { name: string }[] } }) =>
    [...(r.body.students ?? []), ...(r.body.batches ?? [])].map((x) => x.name);

  it('lists show only your own', async () => {
    expect(names(await B.call('GET', '/students?status=all'))).toEqual(['Beta Student']);
    expect(names(await B.call('GET', '/batches?status=all'))).toEqual([]);
    expect(names(await A.call('GET', '/students'))).toEqual(['Alpha Student']);
  });

  it("another institute's ids look exactly like missing ones (404, not 403)", async () => {
    for (const [m, u, p] of [
      ['GET', `/students/${aStudent}`],
      ['PATCH', `/students/${aStudent}`, { name: 'Hacked' }],
      ['POST', `/students/${aStudent}/deactivate`],
      ['POST', `/students/${aStudent}/reactivate`],
      ['GET', `/batches/${aBatch}`],
      ['PATCH', `/batches/${aBatch}`, { name: 'Hacked' }],
      ['POST', `/batches/${aBatch}/archive`],
      ['POST', `/batches/${aBatch}/restore`],
    ] as const) {
      const r = await B.call(m, u, p);
      expect([m, u, r.status, r.body]).toEqual([m, u, 404, { error: 'not_found' }]);
    }
    const missing = await B.call('GET', '/students/00000000-0000-4000-8000-000000000000');
    expect(missing.body).toEqual({ error: 'not_found' });
  });

  it("cannot link its own student to A's batch, or A's student to its own batch", async () => {
    const bStudent = (await B.call('GET', '/students')).body.students[0].id as string;
    const bBatch = await mk(B, '/batches', batch({ name: 'Beta Batch' }));
    expect(
      (await B.call('POST', `/batches/${aBatch}/students`, { studentIds: [bStudent] })).status,
    ).toBe(404);
    expect(
      (await B.call('POST', `/batches/${bBatch}/students`, { studentIds: [aStudent] })).body.error,
    ).toBe('unknown_student');
    expect(
      (await B.call('POST', '/students', student({ name: 'Sneaky', batchIds: [aBatch] }))).body
        .error,
    ).toBe('unknown_batch');
    expect(
      (await B.call('PATCH', `/students/${bStudent}`, { batchIds: [aBatch] })).body.error,
    ).toBe('unknown_batch');
    expect((await B.call('DELETE', `/batches/${aBatch}/students/${aStudent}`)).status).toBe(404);
    expect((await A.call('GET', `/students/${aStudent}`)).body.batchIds).toEqual([aBatch]); // untouched
  });

  it('the batch filter cannot be used to peek at another institute', async () => {
    expect((await B.call('GET', `/students?status=all&batchId=${aBatch}`)).body.students).toEqual(
      [],
    );
  });

  it('the database itself refuses a cross-institute link, even if the code were wrong', async () => {
    const bStudent = (await B.call('GET', '/students')).body.students[0].id as string;
    await expect(
      h.db.pool.query(
        'INSERT INTO student_batches (institute_id, student_id, batch_id) VALUES (?, ?, ?)',
        [B.instituteId, bStudent, aBatch],
      ),
    ).rejects.toThrow(/foreign key/i);
    await expect(
      h.db.pool.query(
        'INSERT INTO student_batches (institute_id, student_id, batch_id) VALUES (?, ?, ?)',
        [A.instituteId, bStudent, aBatch],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it('putting another institute id in the body or query changes nothing', async () => {
    const r = await B.call('POST', `/students?instituteId=${A.instituteId}`, {
      ...student({ name: 'Mine Not Yours' }),
      instituteId: A.instituteId,
      institute_id: A.instituteId,
    });
    expect(r.status).toBe(201);
    expect(names(await A.call('GET', '/students?status=all'))).toEqual(['Alpha Student']);
    expect(names(await B.call('GET', '/students?status=all'))).toEqual([
      'Beta Student',
      'Mine Not Yours',
    ]);
  });

  it("A's plan limit is not affected by B's students", async () => {
    await limits(A, 1, null);
    expect((await A.call('POST', '/students', student({ name: 'Over Limit' }))).status).toBe(402);
    await limits(B, 1000, null);
    expect((await B.call('POST', '/students', student({ name: 'Fine' }))).status).toBe(201);
  });
});

describe('roles', () => {
  it('staff can read students and batches but never change them', async () => {
    const b = await mk(A, '/batches', batch());
    const s = await mk(A, '/students', student({ batchIds: [b] }));
    const staff = await h.tenant('+919000011111'); // makes its own institute; move this user into A as staff instead
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    expect((await staff.call('GET', '/students')).body.students).toHaveLength(1);
    expect((await staff.call('GET', '/batches')).body.batches).toHaveLength(1);
    for (const [m, u, p] of [
      ['POST', '/students', student({ name: 'Staff Add' })],
      ['PATCH', `/students/${s}`, { name: 'X' }],
      ['POST', `/students/${s}/deactivate`],
      ['POST', '/batches', batch({ name: 'Staff Batch' })],
      ['POST', `/batches/${b}/archive`],
      ['POST', '/students/bulk', { students: [student({ name: 'Staff Bulk' })] }],
    ] as const) {
      expect([m, u, (await staff.call(m, u, p)).status]).toEqual([m, u, 403]);
    }
  });

  it('unauthenticated requests get 401 on every route', async () => {
    for (const [m, u] of [
      ['GET', '/students'],
      ['POST', '/students'],
      ['GET', '/batches'],
      ['POST', '/batches'],
      ['GET', `/students/${'0'.repeat(8)}-0000-4000-8000-000000000000`],
    ] as const) {
      expect([m, u, (await h.app.inject({ method: m, url: u })).statusCode]).toEqual([m, u, 401]);
    }
  });
});
