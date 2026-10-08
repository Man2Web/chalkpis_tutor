import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { currentPeriod, generateDuesForInstitute } from './lib/dues';
import { addDays, istDate, previousPeriod, todayYmd, weekdayOf } from './lib/ist';
import { createInstituteForUser } from './lib/institute';
import { recomputeStats } from './lib/stats';

export const DEMO_UID = 'demo-owner';
export const DEMO_PHONE = '+919999900001';

/** Small deterministic random generator so every seed run looks the same. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BATCHES = [
  {
    id: 'maths-10',
    name: 'Maths 10',
    subject: 'Maths',
    class: '10',
    days: ['mon', 'wed', 'fri'],
    startTime: '17:00',
    endTime: '18:00',
    defaultFee: 150000,
  },
  {
    id: 'science-9',
    name: 'Science 9',
    subject: 'Science',
    class: '9',
    days: ['tue', 'thu'],
    startTime: '16:00',
    endTime: '17:00',
    defaultFee: 120000,
  },
  {
    id: 'english-8',
    name: 'English 8',
    subject: 'English',
    class: '8',
    days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    startTime: '10:00',
    endTime: '11:30',
    defaultFee: 100000,
  },
];

const NAMES = [
  'Aarav Sharma',
  'Diya Patel',
  'Vihaan Gupta',
  'Ananya Iyer',
  'Arjun Reddy',
  'Ishita Nair',
  'Kabir Singh',
  'Meera Das',
  'Rohan Verma',
  'Saanvi Rao',
  'Aditya Menon',
  'Navya Joshi',
  'Krish Kumar',
  'Riya Bose',
  'Dev Malhotra',
  'Tara Pillai',
  'Yash Chopra',
  'Zoya Khan',
  'Ayaan Ali',
  'Pooja Nambiar',
  'Harsh Vora',
  'Kavya Shetty',
  'Nikhil Jain',
  'Sneha Kulkarni',
  'Varun Mehta',
  'Lakshmi Prasad',
  'Om Tiwari',
  'Anika Sen',
  'Reyansh Dutta',
  'Mira Hegde',
];

const MODES = ['cash', 'upi', 'bank'] as const;

export interface SeedSummary {
  instituteId: string;
  created: boolean;
  batches: number;
  students: number;
  attendanceDays: number;
  dues: number;
  payments: number;
}

/**
 * Fills one institute with demo data: 3 batches, 30 students, about a month of attendance, two months
 * of fee dues and a realistic mix of paid, part-paid and pending. Does nothing if the owner already has an institute.
 */
export async function seedInstitute(
  db: Firestore,
  now: Date = new Date(),
  uid = DEMO_UID,
  phone = DEMO_PHONE,
): Promise<SeedSummary> {
  const { instituteId, created } = await createInstituteForUser(
    db,
    uid,
    phone,
    { tutorName: 'Demo Tutor', instituteName: 'Demo Tuition Centre' },
    now,
  );
  const empty = {
    instituteId,
    created,
    batches: 0,
    students: 0,
    attendanceDays: 0,
    dues: 0,
    payments: 0,
  };
  if (!created) return empty;

  const base = db.collection('institutes').doc(instituteId);
  const rand = mulberry32(42);
  const today = todayYmd(now);
  const stamp = Timestamp.fromDate(now);
  await db.doc(`users/${uid}`).update({ onboardingDone: true });

  // Batches and students
  const batch0 = db.batch();
  for (const b of BATCHES) {
    batch0.set(base.collection('batches').doc(b.id), {
      ...b,
      status: 'active',
      staffUids: [],
      studentCount: 10,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  const students: { id: string; batchId: string; fee: number; index: number }[] = [];
  NAMES.forEach((name, i) => {
    const b = BATCHES[i % 3];
    const id = `student-${String(i + 1).padStart(2, '0')}`;
    students.push({ id, batchId: b.id, fee: b.defaultFee, index: i });
    batch0.set(base.collection('students').doc(id), {
      name,
      phone: i % 4 === 0 ? `+9190000${String(2000 + i)}` : '',
      parentName: `Parent of ${name.split(' ')[0]}`,
      parentPhone: `+9190000${String(1000 + i)}`,
      class: b.class,
      photoUrl: null,
      joinedAt: Timestamp.fromDate(istDate(addDays(today, -75), 10)),
      status: 'active',
      batchIds: [b.id],
      monthlyFee: b.defaultFee,
      feeCycle: 'monthly',
      dueDay: 5,
      notifyParent: true,
      notes: '',
      createdAt: stamp,
      updatedAt: stamp,
    });
  });
  await batch0.commit();
  await recomputeStats(db, instituteId);

  // Attendance: the last 30 days, on each batch's class days; one holiday per batch. Student #4 is often absent.
  let attendanceDays = 0;
  let writes = db.batch();
  let pending = 0;
  for (let back = 30; back >= 1; back--) {
    const date = addDays(today, -back);
    for (const b of BATCHES) {
      if (!b.days.includes(weekdayOf(date))) continue;
      const holiday = back === 10;
      const marks: Record<string, string> = {};
      if (!holiday) {
        for (const s of students.filter((x) => x.batchId === b.id)) {
          const r = rand();
          const absentChance = s.index === 3 ? 0.5 : 0.1;
          marks[s.id] = r < absentChance ? 'A' : r < absentChance + 0.08 ? 'L' : 'P';
        }
      }
      writes.set(base.collection('attendance').doc(`${b.id}_${date.replace(/-/g, '')}`), {
        batchId: b.id,
        date,
        marks,
        holiday,
        reason: holiday ? 'holiday' : null,
        markedBy: uid,
        markedAt: stamp,
        createdAt: stamp,
        updatedAt: stamp,
      });
      attendanceDays++;
      if (++pending === 400) {
        await writes.commit();
        writes = db.batch();
        pending = 0;
      }
    }
  }
  if (pending) await writes.commit();

  // Fee dues for last month and this month (the same function the daily job uses)
  const prev = previousPeriod(today);
  const cur = currentPeriod(now);
  const duesCreated =
    (await generateDuesForInstitute(db, instituteId, prev)) +
    (await generateDuesForInstitute(db, instituteId, cur));

  // Payments: last month 60% paid in full, 20% part-paid, 20% unpaid (overdue); this month 30% paid
  const instSnap = await base.get();
  let seq: number = instSnap.data()?.nextReceiptNo ?? 1;
  const prefix: string = instSnap.data()?.receiptPrefix ?? 'TD';
  let payments = 0;
  let pw = db.batch();
  let pwCount = 0;
  const plan: { period: string; day: number; fraction: (i: number) => number }[] = [
    { period: prev, day: 8, fraction: (i) => (i % 10 < 6 ? 1 : i % 10 < 8 ? 0.4 : 0) },
    { period: cur, day: 6, fraction: (i) => (i % 10 < 3 ? 1 : 0) },
  ];
  for (const p of plan) {
    for (const s of students) {
      const frac = p.fraction(s.index);
      if (frac === 0) continue;
      const amount = Math.round((s.fee * frac) / 100) * 100;
      const dueRef = base.collection('feeDues').doc(`${s.id}_${p.period}`);
      const payDate = `${p.period}-${String(p.day + (s.index % 10)).padStart(2, '0')}`;
      const when = payDate > today ? today : payDate;
      pw.set(base.collection('payments').doc(), {
        studentId: s.id,
        dueId: dueRef.id,
        amount,
        mode: MODES[s.index % 3],
        paidAt: Timestamp.fromDate(istDate(when, 11)),
        receiptNo: `${prefix}-${String(seq).padStart(5, '0')}`,
        receiptUrl: null,
        note: '',
        recordedBy: uid,
        balanceAfter: s.fee - amount,
        batchId: s.batchId,
        createdAt: stamp,
        updatedAt: stamp,
      });
      pw.update(dueRef, {
        paid: amount,
        status: amount >= s.fee ? 'paid' : 'partial',
        updatedAt: stamp,
      });
      seq++;
      payments++;
      pwCount += 2;
      if (pwCount >= 400) {
        await pw.commit();
        pw = db.batch();
        pwCount = 0;
      }
    }
  }
  pw.update(base, { nextReceiptNo: seq, updatedAt: stamp });
  await pw.commit();

  return {
    instituteId,
    created,
    batches: BATCHES.length,
    students: students.length,
    attendanceDays,
    dues: duesCreated,
    payments,
  };
}
