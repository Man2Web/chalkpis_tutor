import { toYmd, weekdayOf } from '../../lib/dates';
import type { AttendanceDoc, Batch, FeeDue, Payment, Student } from '../../lib/types';
import { counts } from '../attendance/logic';
import { groupByStudent, netCollected, totals } from '../fees/logic';

export interface DashboardInput {
  students: Student[];
  batches: Batch[];
  attendanceToday: AttendanceDoc[];
  unpaid: FeeDue[];
  paymentsMonth: Payment[];
  today: string; // yyyy-mm-dd
}

export interface TodayBatch {
  batch: Batch;
  status: 'notMarked' | 'marked' | 'holiday' | 'cancelled';
  present: number; // present + late
  total: number;
}

export function dashboardStats(i: DashboardInput) {
  const activeBatches = i.batches.filter((b) => b.status === 'active');
  const activeIds = new Set(activeBatches.map((b) => b.id));
  const byBatch = new Map(i.attendanceToday.map((d) => [d.batchId, d]));

  let present = 0;
  let marked = 0;
  for (const d of i.attendanceToday) {
    if (d.holiday || !activeIds.has(d.batchId)) continue;
    const c = counts(Object.values(d.marks));
    present += c.P + c.L;
    marked += c.P + c.L + c.A;
  }

  // Batches that meet today, plus any batch already marked today.
  const weekday = weekdayOf(i.today);
  const todaysBatches: TodayBatch[] = activeBatches
    .filter((b) => b.days.includes(weekday) || byBatch.has(b.id))
    .map((batch) => {
      const d = byBatch.get(batch.id);
      if (!d) return { batch, status: 'notMarked' as const, present: 0, total: 0 };
      if (d.holiday)
        return {
          batch,
          status: d.reason === 'cancelled' ? ('cancelled' as const) : ('holiday' as const),
          present: 0,
          total: 0,
        };
      const c = counts(Object.values(d.marks));
      return { batch, status: 'marked' as const, present: c.P + c.L, total: c.P + c.L + c.A };
    });

  const dues = totals(groupByStudent(i.unpaid, i.today, (d) => toYmd(d.dueDate.toDate())));
  const paidToday = i.paymentsMonth.filter((p) => toYmd(p.paidAt.toDate()) === i.today);

  return {
    activeStudents: i.students.filter((s) => s.status === 'active').length,
    activeBatches: activeBatches.length,
    presentToday: present,
    markedToday: marked,
    pendingAmount: dues.outstanding,
    pendingStudents: dues.students,
    overdueAmount: dues.overdueAmount,
    overdueStudents: dues.overdueStudents,
    collectedToday: netCollected(paidToday),
    collectedMonth: netCollected(i.paymentsMonth),
    todaysBatches,
  };
}

export interface DayPoint {
  date: string;
  /** Share present or late, 0-100; null when nothing was marked that day. */
  pct: number | null;
}

/** The last 7 days ending today, oldest first, for the Home chart. Holidays count as not marked. */
export function weekAttendance(
  docs: AttendanceDoc[],
  today: string,
  addDays: (d: string, n: number) => string,
): DayPoint[] {
  const out: DayPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    let p = 0;
    let t = 0;
    for (const d of docs) {
      if (d.date !== date || d.holiday) continue;
      for (const m of Object.values(d.marks)) {
        t++;
        if (m !== 'A') p++;
      }
    }
    out.push({ date, pct: t ? Math.round((p / t) * 100) : null });
  }
  return out;
}

/** Days in a row, counting back from today (or yesterday if today is not marked yet), with attendance saved. */
export function markingStreak(points: DayPoint[]): number {
  let i = points.length - 1;
  if (i >= 0 && points[i]!.pct === null) i--;
  let n = 0;
  for (; i >= 0 && points[i]!.pct !== null; i--) n++;
  return n;
}
