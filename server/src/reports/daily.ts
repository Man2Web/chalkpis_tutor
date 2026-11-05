import type { Pool, PoolConnection } from '../db.js';
import { feesOverview } from '../fees/service.js';
import { addDays, todayYmd, weekdayOf } from '../lib/ist.js';
import { queueCentre } from '../messaging/centreMessages.js';
import { clock12 } from '../messaging/notify.js';
import { cleanVar, rupees, templateFor, type TemplateMap } from '../messaging/templates.js';

type Db = Pool | PoolConnection;

/**
 * The daily report an owner gets on WhatsApp at 6 am (decision 167): what happened at the centre yesterday and what
 * today holds. Plain numbers; the words are made by `dailyReportVars`.
 */
export interface DailyReport {
  /** yyyy-mm-dd, Indian days */
  yesterday: string;
  today: string;
  /** yesterday's classes with attendance marked (holidays and cancelled ones counted apart) */
  attendance: {
    classes: number;
    present: number;
    absent: number;
    late: number;
    holiday: number;
    cancelled: number;
    /** classes on yesterday's timetable (with students) that nobody marked, leaving out calendar holidays */
    notMarked: number;
  };
  /** a holiday in the calendar for the whole centre: its title */
  holidayYesterday: string | null;
  /** money recorded as paid yesterday, net of reversals, in paise */
  collected: { net: number; payments: number };
  newStudents: number;
  newEnquiries: number;
  /** today's timetable (batches with students, leaving out calendar holidays) */
  classesToday: { count: number; firstStart: string | null };
  holidayToday: string | null;
  testsToday: number;
  /** calendar events today that are not holidays (exams, events, parent meetings) */
  eventsToday: string[];
  /** what is owed now, as on the Fees screen, in paise */
  fees: { outstanding: number; students: number; overdue: number };
  /** open enquiries whose follow-up day is today or already past */
  followUps: number;
}

const istStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Thu, 5 Nov" */
export const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/** Gathers one centre's report as of `now` (meant to run early in the Indian morning). */
export async function gatherDailyReport(
  db: Db,
  instituteId: string,
  now: Date,
): Promise<DailyReport> {
  const today = todayYmd(now);
  const yesterday = addDays(today, -1);
  const [from, to] = [istStart(yesterday), istStart(today)];

  const [batches] = (await db.query(
    `SELECT b.id, b.days, b.start_time, b.created_at,
            (SELECT COUNT(*) FROM student_batches sb JOIN students s ON s.institute_id = sb.institute_id AND s.id = sb.student_id
              WHERE sb.institute_id = b.institute_id AND sb.batch_id = b.id AND s.status = 'active') AS students
       FROM batches b WHERE b.institute_id = ? AND b.status = 'active'`,
    [instituteId],
  )) as unknown as [
    { id: string; days: string; start_time: string; created_at: Date; students: number }[],
  ];

  const [marked] = (await db.query(
    `SELECT d.batch_id, d.holiday, COALESCE(SUM(m.mark = 'P'), 0) AS p, COALESCE(SUM(m.mark = 'A'), 0) AS a,
            COALESCE(SUM(m.mark = 'L'), 0) AS l
       FROM attendance_days d LEFT JOIN attendance_marks m ON m.institute_id = d.institute_id AND m.day_id = d.id
      WHERE d.institute_id = ? AND d.day = ? GROUP BY d.id, d.batch_id, d.holiday`,
    [instituteId, yesterday],
  )) as unknown as [
    { batch_id: string; holiday: string | null; p: number; a: number; l: number }[],
  ];

  const [events] = (await db.query(
    `SELECT title, kind, batch_id, DATE_FORMAT(starts_on, '%Y-%m-%d') AS starts_on, DATE_FORMAT(ends_on, '%Y-%m-%d') AS ends_on
       FROM calendar_events WHERE institute_id = ? AND starts_on <= ? AND ends_on >= ?
      ORDER BY starts_on, title`,
    [instituteId, today, yesterday],
  )) as unknown as [
    { title: string; kind: string; batch_id: string | null; starts_on: string; ends_on: string }[],
  ];
  const on = (ymd: string) => events.filter((e) => e.starts_on <= ymd && e.ends_on >= ymd);
  const holidays = (ymd: string) => on(ymd).filter((e) => e.kind === 'holiday');
  const centreHoliday = (ymd: string) => holidays(ymd).find((e) => !e.batch_id)?.title ?? null;
  const offByCalendar = (ymd: string, batchId: string) =>
    holidays(ymd).some((e) => !e.batch_id || e.batch_id === batchId);
  const timetable = (ymd: string) =>
    batches.filter(
      (b) =>
        Number(b.students) > 0 &&
        b.days.split(',').includes(weekdayOf(ymd)) &&
        b.created_at < istStart(addDays(ymd, 1)) &&
        !offByCalendar(ymd, b.id),
    );

  const markedIds = new Set(marked.map((m) => m.batch_id));
  const held = marked.filter((m) => !m.holiday);
  const todays = timetable(today);

  const one = async (sql: string, args: unknown[]) => {
    const [[row]] = (await db.query(sql, args)) as unknown as [[Record<string, unknown>]];
    return row ?? {};
  };
  const paid = await one(
    `SELECT COALESCE(SUM(amount), 0) AS net, COALESCE(SUM(amount > 0), 0) AS n FROM payments
      WHERE institute_id = ? AND paid_at >= ? AND paid_at < ?`,
    [instituteId, from, to],
  );
  const added = await one(
    `SELECT (SELECT COUNT(*) FROM students WHERE institute_id = ? AND created_at >= ? AND created_at < ?) AS students,
            (SELECT COUNT(*) FROM enquiries WHERE institute_id = ? AND created_at >= ? AND created_at < ?) AS enquiries,
            (SELECT COUNT(*) FROM exams WHERE institute_id = ? AND exam_date = ?) AS tests,
            (SELECT COUNT(*) FROM enquiries WHERE institute_id = ? AND status IN ('new','follow_up','trial')
               AND next_follow_up IS NOT NULL AND next_follow_up <= ?) AS follow_ups`,
    [instituteId, from, to, instituteId, from, to, instituteId, today, instituteId, today],
  );
  const fees = (await feesOverview(db, instituteId, now)).totals;

  return {
    yesterday,
    today,
    attendance: {
      classes: held.length,
      present: held.reduce((t, m) => t + Number(m.p), 0),
      absent: held.reduce((t, m) => t + Number(m.a), 0),
      late: held.reduce((t, m) => t + Number(m.l), 0),
      holiday: marked.filter((m) => m.holiday === 'holiday').length,
      cancelled: marked.filter((m) => m.holiday === 'cancelled').length,
      notMarked: timetable(yesterday).filter((b) => !markedIds.has(b.id)).length,
    },
    holidayYesterday: centreHoliday(yesterday),
    collected: { net: Number(paid.net), payments: Number(paid.n) },
    newStudents: Number(added.students),
    newEnquiries: Number(added.enquiries),
    classesToday: {
      count: todays.length,
      firstStart: todays.map((b) => b.start_time).sort()[0] ?? null,
    },
    holidayToday: centreHoliday(today),
    testsToday: Number(added.tests),
    eventsToday: on(today)
      .filter((e) => e.kind !== 'holiday')
      .map((e) => e.title),
    fees: { outstanding: fees.outstanding, students: fees.students, overdue: fees.overdueAmount },
    followUps: Number(added.follow_ups),
  };
}

/** "Wed, 4 Nov: 42 present, 3 absent, 1 late in 4 classes; 1 class not marked; ₹4,500 collected (3 payments)." */
export function yesterdayText(r: DailyReport): string {
  const a = r.attendance;
  const parts: string[] = [];
  if (a.classes > 0) {
    const where = ` in ${count(a.classes, 'class', 'classes')}`;
    if (a.present + a.absent + a.late === 0)
      parts.push(`attendance marked for ${count(a.classes, 'class', 'classes')}`);
    else if (a.absent === 0 && a.late === 0) parts.push(`all ${a.present} present${where}`);
    else
      parts.push(
        [
          `${a.present} present`,
          ...(a.absent ? [`${a.absent} absent`] : []),
          ...(a.late ? [`${a.late} late`] : []),
        ].join(', ') + where,
      );
  }
  if (a.notMarked)
    parts.push(`attendance not marked for ${count(a.notMarked, 'class', 'classes')}`);
  if (a.holiday) parts.push(`${count(a.holiday, 'class', 'classes')} on holiday`);
  if (a.cancelled) parts.push(`${count(a.cancelled, 'class', 'classes')} cancelled`);
  if (!parts.length)
    parts.push(r.holidayYesterday ? `holiday (${cleanVar(r.holidayYesterday, 40)})` : 'no classes');
  parts.push(
    r.collected.payments > 0
      ? `${rupees(Math.max(0, r.collected.net))} collected (${count(r.collected.payments, 'payment', 'payments')})`
      : 'no fees collected',
  );
  if (r.newStudents) parts.push(count(r.newStudents, 'new student', 'new students'));
  if (r.newEnquiries) parts.push(count(r.newEnquiries, 'new enquiry', 'new enquiries'));
  return `${dayLabel(r.yesterday)}: ${parts.join('; ')}.`;
}

/** "Thu, 5 Nov: 5 classes, first at 7:00 AM; ₹12,000 fees pending from 8 students (₹6,000 overdue); 2 follow-ups due." */
export function todayText(r: DailyReport): string {
  const parts: string[] = [];
  const c = r.classesToday;
  if (r.holidayToday) parts.push(`holiday (${cleanVar(r.holidayToday, 40)})`);
  else if (c.count === 0) parts.push('no classes');
  else
    parts.push(
      c.count === 1
        ? `1 class at ${clock12(c.firstStart ?? '')}`
        : `${c.count} classes, first at ${clock12(c.firstStart ?? '')}`,
    );
  if (r.testsToday) parts.push(count(r.testsToday, 'test', 'tests'));
  if (r.eventsToday.length === 1) parts.push(`event: ${cleanVar(r.eventsToday[0], 40)}`);
  else if (r.eventsToday.length > 1) parts.push(`${r.eventsToday.length} events`);
  if (r.fees.outstanding > 0)
    parts.push(
      `${rupees(r.fees.outstanding)} fees pending from ${count(r.fees.students, 'student', 'students')}` +
        (r.fees.overdue > 0 ? ` (${rupees(r.fees.overdue)} overdue)` : ''),
    );
  else parts.push('no fees pending');
  if (r.followUps)
    parts.push(`${count(r.followUps, 'enquiry follow-up', 'enquiry follow-ups')} due`);
  return `${dayLabel(r.today)}: ${parts.join('; ')}.`;
}

/**
 * The template values, in the order `cp_daily_report` expects (docs/WHATSAPP-TEMPLATES.md): {{1}} the owner's name,
 * {{2}} the centre, {{3}} yesterday, {{4}} today. Single-line, as WhatsApp requires.
 */
export function dailyReportVars(owner: string, centre: string, r: DailyReport): string[] {
  return [
    cleanVar(owner.trim() || 'there'),
    cleanVar(centre, 90),
    cleanVar(yesterdayText(r), 300),
    cleanVar(todayText(r), 300),
  ];
}

/**
 * Daily at 6 am: queues the report for the owner of every centre whose plan is running (a free trial included), that
 * has at least one active student and has not turned the report off. Once per centre and day (the ref is today's date),
 * so a second run sends nothing new. With no `daily_report` template set, nothing is queued at all, so the first
 * morning after the template is added is the first report. Returns how many were queued.
 */
export async function queueDailyReports(
  pool: Pool,
  now: Date,
  templates: TemplateMap | undefined,
): Promise<number> {
  if (!templates || !templateFor(templates, 'daily_report')) return 0;
  const [rows] = (await pool.query(
    `SELECT i.id, i.name, i.owner_user_id, u.name AS owner_name
       FROM institutes i
       JOIN users u ON u.id = i.owner_user_id
       JOIN subscriptions s ON s.institute_id = i.id
       LEFT JOIN notify_settings n ON n.institute_id = i.id
      WHERE s.status = 'active' AND s.expires_at > ?
        AND COALESCE(n.daily_report, 1) = 1
        AND u.phone IS NOT NULL AND u.blocked_at IS NULL
        AND EXISTS (SELECT 1 FROM students st WHERE st.institute_id = i.id AND st.status = 'active')`,
    [now],
  )) as unknown as [{ id: string; name: string; owner_user_id: string; owner_name: string }[]];
  const today = todayYmd(now);
  let n = 0;
  for (const c of rows) {
    const report = await gatherDailyReport(pool, c.id, now);
    const queued = await queueCentre(
      pool,
      {
        instituteId: c.id,
        type: 'daily_report',
        ref: today,
        userId: c.owner_user_id,
        vars: dailyReportVars(c.owner_name, c.name, report),
      },
      now,
    );
    if (queued) n++;
  }
  return n;
}
