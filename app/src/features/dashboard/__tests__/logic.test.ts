import type { AttendanceDoc, Batch, FeeDue, Payment, Student } from '../../../lib/types';
import { dashboardStats } from '../logic';

const ts = (iso: string) =>
  ({ toDate: () => new Date(`${iso}T10:00:00+05:30`), toMillis: () => 0 }) as never;
const batch = (id: string, days: Batch['days'], extra: Partial<Batch> = {}): Batch => ({
  id,
  name: id,
  subject: 's',
  class: '10',
  days,
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 0,
  status: 'active',
  staffUids: [],
  studentCount: 0,
  ...extra,
});
const student = (id: string, status: Student['status'] = 'active') => ({ id, status }) as Student;
const att = (
  batchId: string,
  marks: AttendanceDoc['marks'],
  extra: Partial<AttendanceDoc> = {},
): AttendanceDoc => ({ id: batchId, batchId, date: '2026-10-08', marks, ...extra });
const due = (id: string, studentId: string, on: string, extra: Partial<FeeDue> = {}) =>
  ({
    id,
    studentId,
    period: on.slice(0, 7),
    amount: 100000,
    discount: 0,
    paid: 0,
    status: 'pending',
    description: 'Monthly fee',
    dueDate: ts(on),
    ...extra,
  }) as FeeDue;
const pay = (amount: number, on: string) =>
  ({ id: String(Math.random()), amount, paidAt: ts(on) }) as unknown as Payment;

const base = {
  students: [],
  batches: [],
  attendanceToday: [],
  unpaid: [],
  paymentsMonth: [],
  today: '2026-10-08',
}; // a Thursday

describe('dashboardStats', () => {
  it('counts only active students and batches', () => {
    const s = dashboardStats({
      ...base,
      students: [student('1'), student('2'), student('3', 'inactive')],
      batches: [batch('a', ['thu']), batch('b', ['thu'], { status: 'archived' })],
    });
    expect(s.activeStudents).toBe(2);
    expect(s.activeBatches).toBe(1);
  });

  it('present today counts present + late over non-holiday days of active batches', () => {
    const s = dashboardStats({
      ...base,
      batches: [
        batch('a', ['thu']),
        batch('b', ['thu']),
        batch('x', ['thu'], { status: 'archived' }),
      ],
      attendanceToday: [
        att('a', { 1: 'P', 2: 'L', 3: 'A' }),
        att('b', {}, { holiday: true, reason: 'holiday' }),
        att('x', { 9: 'P' }),
      ],
    });
    expect(s.presentToday).toBe(2);
    expect(s.markedToday).toBe(3);
  });

  it("today's batches: scheduled ones, plus any already marked, with status", () => {
    const s = dashboardStats({
      ...base,
      batches: [
        batch('thuA', ['thu']),
        batch('monB', ['mon']),
        batch('monC', ['mon']),
        batch('thuD', ['thu']),
      ],
      attendanceToday: [
        att('thuA', { 1: 'P', 2: 'A' }),
        att('monC', {}, { holiday: true, reason: 'cancelled' }),
      ],
    });
    const byId = Object.fromEntries(s.todaysBatches.map((t) => [t.batch.id, t]));
    expect(Object.keys(byId).sort()).toEqual(['monC', 'thuA', 'thuD']);
    expect(byId.thuA).toMatchObject({ status: 'marked', present: 1, total: 2 });
    expect(byId.thuD.status).toBe('notMarked');
    expect(byId.monC.status).toBe('cancelled');
  });

  it('pending fees: amount, students, and overdue part', () => {
    const s = dashboardStats({
      ...base,
      unpaid: [
        due('a1', 'a', '2026-10-05'),
        due('b1', 'b', '2026-10-25'),
        due('b2', 'b', '2026-09-05', { paid: 40000, status: 'partial' }),
      ],
    });
    expect(s.pendingAmount).toBe(100000 + 100000 + 60000);
    expect(s.pendingStudents).toBe(2);
    expect(s.overdueAmount).toBe(100000 + 60000);
    expect(s.overdueStudents).toBe(2);
  });

  it('collected today vs this month, net of reversals', () => {
    const s = dashboardStats({
      ...base,
      paymentsMonth: [
        pay(100000, '2026-10-08'),
        pay(50000, '2026-10-02'),
        pay(-30000, '2026-10-08'),
      ],
    });
    expect(s.collectedToday).toBe(70000);
    expect(s.collectedMonth).toBe(120000);
  });

  it('is all zeros for a brand-new institute', () => {
    expect(dashboardStats(base)).toMatchObject({
      activeStudents: 0,
      presentToday: 0,
      pendingAmount: 0,
      collectedMonth: 0,
      todaysBatches: [],
    });
  });
});
