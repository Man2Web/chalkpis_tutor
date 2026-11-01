/** One student's result in a test: their marks, or absent; null marks and not absent = not entered yet. */
export interface Result {
  studentId: string;
  marks: number | null;
  absent: boolean;
}

const sat = (results: Result[]) =>
  results.filter((r): r is Result & { marks: number } => !r.absent && r.marks !== null);

/**
 * Rank of every student who sat the test, highest marks first. Equal marks share a rank and the next rank skips
 * (98, 95, 95, 90 → 1, 2, 2, 4), as on Indian merit lists. The server ranks the same way (server/src/exams/logic.ts).
 */
export function ranks(results: Result[]): Map<string, number> {
  const list = sat(results).sort((a, b) => b.marks - a.marks);
  const out = new Map<string, number>();
  list.forEach((r, i) => {
    const prev = list[i - 1];
    out.set(r.studentId, prev && prev.marks === r.marks ? out.get(prev.studentId)! : i + 1);
  });
  return out;
}

/** Marks as a percentage of the maximum, to one decimal. */
export const percentOf = (marks: number, max: number) =>
  max > 0 ? Math.round((marks / max) * 1000) / 10 : 0;

/** The CBSE nine-point grade for a percentage (A1 from 91, down to E under 33). */
export function gradeOf(percent: number): string {
  if (percent > 90) return 'A1';
  if (percent > 80) return 'A2';
  if (percent > 70) return 'B1';
  if (percent > 60) return 'B2';
  if (percent > 50) return 'C1';
  if (percent > 40) return 'C2';
  if (percent >= 33) return 'D';
  return 'E';
}

export const passed = (marks: number, max: number, passPercent: number) =>
  percentOf(marks, max) >= passPercent;

/** Marks as people write them: 45, 45.5, 12.25. */
export const marksText = (n: number) => String(Math.round(n * 100) / 100);

/** The numbers above the marks list: how many sat, the average, top and bottom marks, passes and fails. */
export function summary(results: Result[], max: number, passPercent: number) {
  const s = sat(results);
  const marks = s.map((r) => r.marks);
  const pass = s.filter((r) => passed(r.marks, max, passPercent)).length;
  return {
    sat: s.length,
    absent: results.filter((r) => r.absent).length,
    average: s.length ? Math.round((marks.reduce((a, b) => a + b, 0) / s.length) * 10) / 10 : null,
    highest: s.length ? Math.max(...marks) : null,
    lowest: s.length ? Math.min(...marks) : null,
    passed: pass,
    failed: s.length - pass,
  };
}

/**
 * Turns what was typed in a marks box into marks: '' is not entered, a number up to the maximum is the marks,
 * anything else is an error. Commas are read as decimal points (45,5).
 */
export function parseMarks(text: string, max: number): number | null | 'invalid' {
  const v = text.trim().replace(',', '.');
  if (!v) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return 'invalid';
  const n = Number(v);
  return n > max ? 'invalid' : n;
}

/** What a message needs to know about a test. */
export interface ExamLike {
  name: string;
  subject: string;
  date: string;
  maxMarks: number;
  batchName?: string;
}

/** Translate function, as i18next gives it. */
type T = (key: string, opts?: Record<string, unknown>) => string;

/** The WhatsApp message to one parent about their child's result. */
export function resultMessage(
  t: T,
  o: {
    institute: string;
    student: string;
    exam: ExamLike;
    dateText: string;
    marks: number | null;
    absent: boolean;
    rank?: number;
    of: number;
    average: number | null;
    remark?: string;
  },
): string {
  const test = o.exam.subject ? `${o.exam.name} (${o.exam.subject})` : o.exam.name;
  if (o.absent || o.marks === null)
    return t('exams.msg.absent', {
      institute: o.institute,
      student: o.student,
      test,
      date: o.dateText,
    });
  const pct = percentOf(o.marks, o.exam.maxMarks);
  const lines = [
    t('exams.msg.result', {
      institute: o.institute,
      student: o.student,
      test,
      date: o.dateText,
      marks: marksText(o.marks),
      max: marksText(o.exam.maxMarks),
      percent: pct,
      grade: gradeOf(pct),
    }),
  ];
  if (o.rank) lines.push(t('exams.msg.rank', { rank: o.rank, of: o.of }));
  if (o.average !== null) lines.push(t('exams.msg.average', { average: marksText(o.average) }));
  if (o.remark) lines.push(`“${o.remark}”`);
  return lines.join('\n');
}

/** The top three (more on a tie) for the batch's WhatsApp group, with the class average. */
export function toppersMessage(
  t: T,
  exam: ExamLike,
  results: Result[],
  nameOf: (id: string) => string,
): string {
  const r = ranks(results);
  const medals = ['🥇', '🥈', '🥉'];
  const top = [...r.entries()]
    .filter(([, rank]) => rank <= 3)
    .sort((a, b) => a[1] - b[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));
  const marksOf = new Map(results.map((x) => [x.studentId, x.marks]));
  const head = [exam.name, exam.subject, exam.batchName].filter(Boolean).join(' · ');
  const avg = summary(results, exam.maxMarks, 0).average;
  return [
    head,
    t('exams.msg.toppers'),
    ...top.map(
      ([id, rank]) =>
        `${medals[rank - 1] ?? ''} ${nameOf(id)}: ${marksText(marksOf.get(id) ?? 0)}/${marksText(exam.maxMarks)}`,
    ),
    avg === null
      ? ''
      : t('exams.msg.classAverage', { average: marksText(avg), max: marksText(exam.maxMarks) }),
    t('exams.msg.wellDone'),
  ]
    .filter(Boolean)
    .join('\n');
}

const esc = (s: string | number) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export interface CardRow {
  name: string;
  subject: string;
  dateText: string;
  maxMarks: number;
  marks: number | null;
  absent: boolean;
  rank: number | null;
  of: number;
  remark: string;
}

export type CardLabels = Record<
  | 'title'
  | 'student'
  | 'level'
  | 'date'
  | 'test'
  | 'subject'
  | 'marks'
  | 'percent'
  | 'grade'
  | 'rank'
  | 'absent'
  | 'overall'
  | 'testsTaken'
  | 'attendance'
  | 'remarks'
  | 'signature'
  | 'madeWith',
  string
>;

/** A printable report card: the student's tests, the overall percentage and grade, attendance and remarks. */
export function reportCardHtml(o: {
  institute: string;
  student: string;
  level: string;
  periodText: string;
  rows: CardRow[];
  attendancePct: number | null;
  L: CardLabels;
}): string {
  const { L } = o;
  const took = o.rows.filter((r) => !r.absent && r.marks !== null);
  const got = took.reduce((t, r) => t + (r.marks as number), 0);
  const out = took.reduce((t, r) => t + r.maxMarks, 0);
  const overall = out ? percentOf(got, out) : null;
  const remarks = o.rows.filter((r) => r.remark).map((r) => `${r.name}: ${r.remark}`);
  const row = (r: CardRow) => {
    if (r.absent || r.marks === null)
      return `<tr><td>${esc(r.dateText)}</td><td>${esc(r.name)}</td><td>${esc(r.subject)}</td><td class="r" colspan="4">${esc(L.absent)}</td></tr>`;
    const pct = percentOf(r.marks, r.maxMarks);
    return `<tr><td>${esc(r.dateText)}</td><td>${esc(r.name)}</td><td>${esc(r.subject)}</td><td class="r">${esc(marksText(r.marks))} / ${esc(marksText(r.maxMarks))}</td><td class="r">${pct}%</td><td class="r">${gradeOf(pct)}</td><td class="r">${r.rank ? `${r.rank} / ${r.of}` : '—'}</td></tr>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,Roboto,Arial,sans-serif;color:#14171F;padding:28px;max-width:760px;margin:auto}
h1{font-size:22px;margin:0}.muted{color:#5B6275;font-size:13px}h2{font-size:15px;margin:22px 0 8px}
.who{display:flex;gap:32px;margin:18px 0;padding:14px 16px;border:1px solid #E1E4ED;border-radius:10px}.who b{display:block;font-size:16px}
table{width:100%;border-collapse:collapse}td,th{padding:7px 6px;border-bottom:1px solid #E1E4ED;font-size:13px;text-align:left}th{color:#5B6275;font-weight:600}.r{text-align:right}
.big{display:flex;gap:16px;margin-top:18px}.big div{flex:1;border:1px solid #E1E4ED;border-radius:10px;padding:12px 14px}.big b{display:block;font-size:22px}
.sign{margin-top:48px;display:flex;justify-content:flex-end}.sign div{border-top:1px solid #14171F;padding-top:6px;width:200px;text-align:center;font-size:13px}
.foot{margin-top:28px;color:#8A90A2;font-size:11px;text-align:center}</style></head><body>
<h1>${esc(o.institute)}</h1><div class="muted">${esc(L.title)} · ${esc(o.periodText)}</div>
<div class="who"><div><span class="muted">${esc(L.student)}</span><b>${esc(o.student)}</b></div>${o.level ? `<div><span class="muted">${esc(L.level)}</span><b>${esc(o.level)}</b></div>` : ''}</div>
<table><tr><th>${esc(L.date)}</th><th>${esc(L.test)}</th><th>${esc(L.subject)}</th><th class="r">${esc(L.marks)}</th><th class="r">${esc(L.percent)}</th><th class="r">${esc(L.grade)}</th><th class="r">${esc(L.rank)}</th></tr>
${o.rows.map(row).join('')}</table>
<div class="big"><div><span class="muted">${esc(L.overall)}</span><b>${overall === null ? '—' : `${overall}% · ${gradeOf(overall)}`}</b></div><div><span class="muted">${esc(L.testsTaken)}</span><b>${took.length} / ${o.rows.length}</b></div><div><span class="muted">${esc(L.attendance)}</span><b>${o.attendancePct === null ? '—' : `${o.attendancePct}%`}</b></div></div>
${remarks.length ? `<h2>${esc(L.remarks)}</h2><div class="muted">${remarks.map(esc).join('<br>')}</div>` : ''}
<div class="sign"><div>${esc(L.signature)}</div></div>
<div class="foot">${esc(L.madeWith)}</div>
</body></html>`;
}
