import { getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';
import { generateDuesForInstitute } from './lib/dues';
import { seedInstitute } from './seed';

// Runs only against the Firestore emulator (npm run test:emulator).
const live = !!process.env.FIRESTORE_EMULATOR_HOST;
const d = live ? describe : describe.skip;
const PROJECT = 'tutordesk-seed-test';
const NOW = new Date('2026-10-20T06:00:00Z'); // 11:30 IST, a Tuesday

type Row = FirebaseFirestore.DocumentData & { id: string };
let db: Firestore;
let id: string;
let summary: Awaited<ReturnType<typeof seedInstitute>>;

beforeAll(async () => {
  if (!live) return;
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  db = getFirestore();
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  summary = await seedInstitute(db, NOW);
  id = summary.instituteId;
}, 60000);

const all = async (path: string) =>
  (await db.collection(`institutes/${id}/${path}`).get()).docs.map(
    (x) => ({ id: x.id, ...x.data() }) as Row,
  );

d('seed data (emulator)', () => {
  it('creates 3 batches and 30 students with correct counters', async () => {
    expect(summary).toMatchObject({ created: true, batches: 3, students: 30 });
    expect((await all('batches')).length).toBe(3);
    expect((await all('students')).length).toBe(30);
    const stats = (await db.doc(`institutes/${id}/counters/stats`).get()).data()!;
    expect(stats).toMatchObject({ studentCount: 30, activeStudentCount: 30, batchCount: 3 });
    const batches = await all('batches');
    expect(batches.every((b) => b.studentCount === 10)).toBe(true);
  });

  it('has a month of attendance with valid marks, a holiday, and a chronically absent student', async () => {
    const docs = await all('attendance');
    expect(docs.length).toBe(summary.attendanceDays);
    expect(docs.length).toBeGreaterThan(20);
    expect(docs.some((x) => x.holiday === true)).toBe(true);
    const marks = docs
      .filter((x) => !x.holiday)
      .flatMap((x) => Object.values(x.marks as Record<string, string>));
    expect(marks.every((m) => ['P', 'A', 'L'].includes(m))).toBe(true);
    // student-04 should fall below 75%
    const mine = docs
      .filter((x) => !x.holiday && 'student-04' in x.marks)
      .map((x) => x.marks['student-04'] as string);
    const pct = (mine.filter((m) => m !== 'A').length / mine.length) * 100;
    expect(pct).toBeLessThan(75);
  });

  it('has exactly one due per student per month, and re-running the daily job creates none', async () => {
    const dues = await all('feeDues');
    expect(dues.length).toBe(60);
    expect(new Set(dues.map((x) => x.id)).size).toBe(60);
    expect(await generateDuesForInstitute(db, id, '2026-10')).toBe(0);
    expect(await generateDuesForInstitute(db, id, '2026-09')).toBe(0);
  });

  it('payments have sequential receipt numbers and match their dues exactly', async () => {
    const pays = await all('payments');
    expect(pays.length).toBe(summary.payments);
    const nums = pays.map((p) => Number(String(p.receiptNo).split('-')[1])).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
    const inst = (await db.doc(`institutes/${id}`).get()).data()!;
    expect(inst.nextReceiptNo).toBe(pays.length + 1);

    const dues = await all('feeDues');
    for (const due of dues) {
      const paid = pays.filter((p) => p.dueId === due.id).reduce((s, p) => s + p.amount, 0);
      expect(due.paid).toBe(paid);
      const expected = paid === 0 ? 'pending' : paid >= due.amount ? 'paid' : 'partial';
      expect(due.status).toBe(expected);
    }
  });

  it('leaves a realistic mix: some paid, some part-paid, some overdue', async () => {
    const dues = (await all('feeDues')).filter((x) => x.period === '2026-09');
    const count = (s: string) => dues.filter((x) => x.status === s).length;
    expect(count('paid')).toBe(18);
    expect(count('partial')).toBe(6);
    expect(count('pending')).toBe(6);
  });

  it('is safe to run twice: the second run changes nothing', async () => {
    const again = await seedInstitute(db, NOW);
    expect(again).toMatchObject({ created: false, instituteId: id, students: 0 });
    expect((await all('students')).length).toBe(30);
  });

  it('puts the owner profile through onboarding so login goes straight to the app', async () => {
    const u = (await db.doc('users/demo-owner').get()).data()!;
    expect(u).toMatchObject({ role: 'owner', instituteId: id, onboardingDone: true });
  });
});
