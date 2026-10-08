import type { AttendanceDoc, Batch, FeeDue, Payment, PayMode } from '../../lib/types';
import { netCollected, netDue, outstanding } from '../fees/logic';
import type { Stat } from '../attendance/logic';

export interface CollectionReport {
  billed: number; // net of discounts, for dues of the month
  collected: number; // cash received in the month (net of reversals), whatever the due's month
  pending: number; // still owed on the month's dues
  waived: number; // forgiven on the month's dues
  byMode: Record<PayMode, number>;
  byBatch: { batchId: string | null; amount: number }[];
}

/**
 * Monthly collection. `dues` are the dues of that month (period == month);
 * `payments` are the payments recorded in that month.
 */
export function collectionReport(dues: FeeDue[], payments: Payment[]): CollectionReport {
  const byMode: Record<PayMode, number> = { cash: 0, upi: 0, bank: 0, other: 0 };
  const batch = new Map<string | null, number>();
  for (const p of payments) {
    byMode[p.mode] = (byMode[p.mode] ?? 0) + p.amount;
    const key = (p as { batchId?: string | null }).batchId ?? null;
    batch.set(key, (batch.get(key) ?? 0) + p.amount);
  }
  return {
    billed: dues.reduce((s, d) => s + netDue(d), 0),
    collected: netCollected(payments),
    pending: dues.reduce((s, d) => s + outstanding(d), 0),
    waived: dues
      .filter((d) => d.status === 'waived')
      .reduce((s, d) => s + Math.max(0, netDue(d) - d.paid), 0),
    byMode,
    byBatch: [...batch]
      .map(([batchId, amount]) => ({ batchId, amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export interface TrendPoint {
  date: string;
  pct: number;
  present: number;
  total: number;
}

/** Class-wide attendance per day (all batches), oldest first. Holiday days are skipped. */
export function attendanceTrend(docs: AttendanceDoc[]): TrendPoint[] {
  const byDate = new Map<string, { p: number; t: number }>();
  for (const d of docs) {
    if (d.holiday) continue;
    const marks = Object.values(d.marks);
    if (!marks.length) continue;
    const cur = byDate.get(d.date) ?? { p: 0, t: 0 };
    cur.p += marks.filter((m) => m !== 'A').length;
    cur.t += marks.length;
    byDate.set(d.date, cur);
  }
  return [...byDate]
    .map(([date, v]) => ({
      date,
      present: v.p,
      total: v.t,
      pct: Math.round((v.p / v.t) * 1000) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface StudentRow {
  name: string;
  className: string;
  stat: Stat;
}

export interface ReportData {
  month: string; // yyyy-mm
  institute: string;
  collection: CollectionReport;
  batches: Pick<Batch, 'id' | 'name'>[];
  students: StudentRow[];
  attendancePct: number | null;
  sessions: number;
}

const rupees = (paise: number) => (paise / 100).toFixed(2);
const batchName = (data: ReportData, id: string | null) =>
  id ? (data.batches.find((b) => b.id === id)?.name ?? id) : 'No batch';

/** Rows for a spreadsheet: summary, by mode, by batch, then one row per student. Money in rupees. */
export function reportCsvRows(data: ReportData): (string | number)[][] {
  const c = data.collection;
  const rows: (string | number)[][] = [
    ['Report', data.month, data.institute],
    [],
    ['Collection'],
    ['Billed (after discounts)', rupees(c.billed)],
    ['Collected this month', rupees(c.collected)],
    ['Pending', rupees(c.pending)],
    ['Waived', rupees(c.waived)],
    [],
    ['Collected by payment mode'],
    ...Object.entries(c.byMode).map(([mode, amt]) => [mode, rupees(amt)]),
    [],
    ['Collected by batch'],
    ...c.byBatch.map((b) => [batchName(data, b.batchId), rupees(b.amount)]),
    [],
    ['Attendance'],
    ['Average attendance %', data.attendancePct ?? ''],
    ['Classes held', data.sessions],
    [],
    ['Student', 'Class', 'Present', 'Late', 'Absent', 'Attendance %'],
    ...data.students.map((s) => [
      s.name,
      s.className,
      s.stat.present,
      s.stat.late,
      s.stat.absent,
      s.stat.pct ?? '',
    ]),
  ];
  return rows;
}

const esc = (s: string | number) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export type ReportLabels = Record<
  | 'title'
  | 'collection'
  | 'billed'
  | 'collected'
  | 'pending'
  | 'waived'
  | 'byMode'
  | 'byBatch'
  | 'attendance'
  | 'average'
  | 'classes'
  | 'student'
  | 'present'
  | 'late'
  | 'absent'
  | 'percent'
  | 'noBatch',
  string
>;

/** Printable report. `fmt` formats paise (e.g. ₹1,500); `modeLabel` translates payment modes. */
export function reportHtml(
  data: ReportData,
  L: ReportLabels,
  fmt: (paise: number) => string,
  modeLabel: (m: string) => string,
  monthText: string,
): string {
  const c = data.collection;
  const kv = (k: string, v: string) => `<tr><td>${esc(k)}</td><td class="r">${esc(v)}</td></tr>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#14171F;padding:24px;max-width:720px;margin:auto}
h1{font-size:20px;margin:0}h2{font-size:15px;margin:20px 0 6px;color:#2F5BEA}.muted{color:#5B6275;font-size:13px}
table{width:100%;border-collapse:collapse}td,th{padding:6px 4px;border-bottom:1px solid #E1E4ED;font-size:14px;text-align:left}.r{text-align:right}</style></head><body>
<h1>${esc(data.institute)}</h1><div class="muted">${esc(L.title)} • ${esc(monthText)}</div>
<h2>${esc(L.collection)}</h2><table>${kv(L.billed, fmt(c.billed))}${kv(L.collected, fmt(c.collected))}${kv(L.pending, fmt(c.pending))}${kv(L.waived, fmt(c.waived))}</table>
<h2>${esc(L.byMode)}</h2><table>${Object.entries(c.byMode)
    .map(([m, a]) => kv(modeLabel(m), fmt(a)))
    .join('')}</table>
<h2>${esc(L.byBatch)}</h2><table>${c.byBatch.map((b) => kv(b.batchId ? batchName(data, b.batchId) : L.noBatch, fmt(b.amount))).join('')}</table>
<h2>${esc(L.attendance)}</h2><div class="muted">${esc(L.average)}: ${data.attendancePct === null ? '—' : `${esc(data.attendancePct)}%`} • ${esc(L.classes)}: ${esc(data.sessions)}</div>
<table><tr><th>${esc(L.student)}</th><th class="r">${esc(L.present)}</th><th class="r">${esc(L.late)}</th><th class="r">${esc(L.absent)}</th><th class="r">${esc(L.percent)}</th></tr>
${data.students.map((s) => `<tr><td>${esc(s.name)}</td><td class="r">${s.stat.present}</td><td class="r">${s.stat.late}</td><td class="r">${s.stat.absent}</td><td class="r">${s.stat.pct === null ? '—' : `${s.stat.pct}%`}</td></tr>`).join('')}</table>
</body></html>`;
}
