import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { average, percentOf, ranks } from '../src/exams/logic.js';
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
let meena: string;
let exam: string;

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
  meena = await kid('Meena', '9876500003');
  exam = await mk(A, '/exams', {
    batchId,
    name: 'Unit test 1',
    subject: 'Algebra',
    date: '2026-10-07',
    maxMarks: 50,
  });
});

describe('ranking', () => {
  it('shares a rank on equal marks and skips the next, and leaves absent students out', () => {
    const r = ranks([
      { studentId: 'a', marks: 45, absent: false },
      { studentId: 'b', marks: 48, absent: false },
      { studentId: 'c', marks: 45, absent: false },
      { studentId: 'd', marks: 30, absent: false },
      { studentId: 'e', marks: null, absent: true },
      { studentId: 'f', marks: null, absent: false },
    ]);
    expect(Object.fromEntries(r)).toEqual({ b: 1, a: 2, c: 2, d: 4 });
    expect(percentOf(42.5, 50)).toBe(85);
    expect(average([{ studentId: 'a', marks: 40, absent: false }])).toBe(40);
    expect(average([{ studentId: 'a', marks: null, absent: true }])).toBeNull();
  });
});

describe('tests and marks', () => {
  it('creates a test for a batch and lists it with the batch and how many are marked', async () => {
    const list = (await A.call('GET', '/exams')).body.exams;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: exam,
      batchId,
      batchName: 'Maths 10',
      name: 'Unit test 1',
      subject: 'Algebra',
      date: '2026-10-07',
      maxMarks: 50,
      passPercent: 35,
      entered: 0,
      students: 3,
      average: null,
    });
    expect((await A.call('GET', `/exams?batchId=${batchId}`)).body.exams).toHaveLength(1);
  });

  it('saves marks, absences and remarks, and clears a result sent back empty', async () => {
    const r = await A.call('PUT', `/exams/${exam}/marks`, {
      marks: [
        { studentId: asha, marks: 47.5, remark: 'Excellent' },
        { studentId: ravi, marks: 31 },
        { studentId: meena, marks: 20, absent: true },
      ],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    let got = (await A.call('GET', `/exams/${exam}`)).body;
    expect(got.exam.name).toBe('Unit test 1');
    expect(new Set(got.roster)).toEqual(new Set([asha, ravi, meena]));
    const byId = Object.fromEntries(
      got.results.map((x: { studentId: string }) => [x.studentId, x]),
    );
    expect(byId[asha]).toMatchObject({ marks: 47.5, absent: false, remark: 'Excellent' });
    // absent wins over marks
    expect(byId[meena]).toMatchObject({ marks: null, absent: true });
    expect((await A.call('GET', '/exams')).body.exams[0]).toMatchObject({
      entered: 3,
      average: 39.3,
    });

    await A.call('PUT', `/exams/${exam}/marks`, { marks: [{ studentId: ravi, marks: null }] });
    got = (await A.call('GET', `/exams/${exam}`)).body;
    expect(got.results.map((x: { studentId: string }) => x.studentId).sort()).toEqual(
      [asha, meena].sort(),
    );
  });

  it('refuses marks above the maximum, a student twice, or a student from another centre', async () => {
    const over = await A.call('PUT', `/exams/${exam}/marks`, {
      marks: [{ studentId: asha, marks: 51 }],
    });
    expect(over.status).toBe(400);
    expect(over.body.error).toBe('marks_over_max');
    const twice = await A.call('PUT', `/exams/${exam}/marks`, {
      marks: [
        { studentId: asha, marks: 10 },
        { studentId: asha, marks: 12 },
      ],
    });
    expect(twice.body.error).toBe('duplicate_student');
    const bBatch = await mk(B, '/batches', batch());
    const outsider = await mk(B, '/students', {
      name: 'Other',
      parentPhone: '9876500009',
      monthlyFee: 0,
      batchIds: [bBatch],
    });
    const foreign = await A.call('PUT', `/exams/${exam}/marks`, {
      marks: [{ studentId: outsider, marks: 10 }],
    });
    expect(foreign.body.error).toBe('unknown_student');
    // nothing from the refused saves stuck
    expect((await A.call('GET', `/exams/${exam}`)).body.results).toHaveLength(0);
  });

  it('keeps every centre to its own tests', async () => {
    expect((await B.call('GET', '/exams')).body.exams).toHaveLength(0);
    expect((await B.call('GET', `/exams/${exam}`)).status).toBe(404);
    expect((await B.call('PATCH', `/exams/${exam}`, { name: 'x' })).status).toBe(404);
    expect((await B.call('PUT', `/exams/${exam}/marks`, { marks: [] })).status).toBe(404);
    expect((await B.call('DELETE', `/exams/${exam}`)).status).toBe(404);
    expect(
      (await B.call('POST', '/exams', { batchId, name: 'x', date: '2026-10-07', maxMarks: 10 }))
        .status,
    ).toBe(404);
  });

  it('edits a test but never lowers the maximum below a mark already given', async () => {
    await A.call('PUT', `/exams/${exam}/marks`, { marks: [{ studentId: asha, marks: 45 }] });
    expect((await A.call('PATCH', `/exams/${exam}`, { maxMarks: 40 })).body.error).toBe(
      'marks_over_max',
    );
    expect(
      (await A.call('PATCH', `/exams/${exam}`, { maxMarks: 100, name: 'Unit test 1 (re)' })).status,
    ).toBe(200);
    expect((await A.call('GET', `/exams/${exam}`)).body.exam).toMatchObject({
      maxMarks: 100,
      name: 'Unit test 1 (re)',
    });
  });

  it("shows a student's results with percentage, rank and class average, and on the parent page", async () => {
    await A.call('PUT', `/exams/${exam}/marks`, {
      marks: [
        { studentId: asha, marks: 40 },
        { studentId: ravi, marks: 45 },
        { studentId: meena, marks: null, absent: true },
      ],
    });
    const mine = (await A.call('GET', `/students/${asha}/exams`)).body.exams;
    expect(mine[0]).toMatchObject({
      name: 'Unit test 1',
      marks: 40,
      percent: 80,
      rank: 2,
      of: 2,
      classAverage: 42.5,
    });
    const link = await A.call('POST', `/students/${asha}/parent-link`, {});
    const view = await h.app.inject({
      method: 'POST',
      url: '/api/parent',
      payload: { token: link.body.token },
    });
    const tests = view.json().tests;
    expect(tests).toHaveLength(1);
    expect(tests[0]).toMatchObject({
      name: 'Unit test 1',
      marks: 40,
      maxMarks: 50,
      rank: 2,
      of: 2,
    });
    // the parent sees their own child's result only, never another student's name
    expect(JSON.stringify(view.json())).not.toContain('Ravi');
  });

  it('is for the owner only: a helper cannot see or change tests', async () => {
    const helper = await A.call('POST', '/staff', { name: 'Helper', phone: '9811111111' });
    expect(helper.status, JSON.stringify(helper.body)).toBeLessThan(300);
    const staff = h.login(helper.body.userId ?? helper.body.id, A.instituteId);
    expect((await staff.call('GET', '/exams')).status).toBe(403);
  });

  it('deletes a test with its marks, and logs what was done', async () => {
    await A.call('PUT', `/exams/${exam}/marks`, { marks: [{ studentId: asha, marks: 40 }] });
    expect((await A.call('DELETE', `/exams/${exam}`)).status).toBe(200);
    expect((await A.call('GET', '/exams')).body.exams).toHaveLength(0);
    expect((await A.call('GET', `/students/${asha}/exams`)).body.exams).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 50));
    const [log] = (await h.db.pool.query(
      'SELECT action, subject FROM activity_log WHERE institute_id = ? ORDER BY id',
      [A.instituteId],
    )) as unknown as [{ action: string; subject: string }[]];
    expect(log.map((l) => l.action)).toEqual(
      expect.arrayContaining(['exam.add', 'exam.marks', 'exam.delete']),
    );
    expect(log.find((l) => l.action === 'exam.add')?.subject).toBe('Maths 10');
  });
});
