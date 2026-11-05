import type { Mail, Mailer } from '../auth/mailer.js';
import { PLANS, isPlanId } from '../billing/plans.js';
import type { Pool } from '../db.js';
import { addDays, todayYmd } from '../lib/ist.js';
import { billingOverview, billingQuery } from './billing.js';
import { waSpend } from './waSpend.js';

/**
 * The super admins' daily email (decision 166): yesterday at Chalkpis in one short mail at 8 am Indian time. Only what
 * the owner acts on: new centres (with the owner's number, to call), plan payments, paying centres and MRR (the same
 * numbers as the Revenue page), trials ending today or tomorrow and the ones that ended unpaid, and the WhatsApp wallet
 * (the same estimate as WhatsApp > Spend & balance) with yesterday's spend and failed messages.
 */

const istStart = (ymd: string) => new Date(`${ymd}T00:00:00+05:30`);
/** Payments that count as money, as the Revenue page counts them (REAL in billing.ts, more than ₹0), for `e`. */
const REAL_E = "e.status = 'applied' AND e.sandbox = 0 AND e.currency = 'INR' AND e.amount > 0";
/** An iPhone owner's trial from the website waits for their first sign-in in the app, then restarts (decision 147). */
const NOT_WAITING = 'NOT (s.plan = ? AND i.trial_on_first_app_use = 1)';

const HEARD: Record<string, string> = {
  instagram: 'Instagram/Facebook',
  youtube: 'YouTube',
  google: 'Google',
  store: 'Play/App Store',
  whatsapp: 'WhatsApp',
  friend: 'a friend',
  team: 'Chalkpis team',
};
const SOURCE: Record<string, string> = {
  apple: 'App Store',
  google: 'Google Play',
  manual: 'recorded by an admin',
};

export interface Lead {
  name: string;
  owner: string;
  phone: string | null;
  students: number;
}
export interface DailySummary {
  /** the day reported on, yyyy-mm-dd (Indian) */
  day: string;
  signups: (Lead & {
    category: string;
    city: string | null;
    heardFrom: string | null;
    /** "website (iPhone)", "app" */
    channel: string;
  })[];
  /** new centres from the 1st of the day's month to the end of the day */
  signupsMonth: number;
  /** numbers verified that day that have set up no centre (nor joined one) yet */
  unfinished: number;
  payments: { centre: string; plan: string; amount: number; source: string }[];
  /** paise, from the 1st of the day's month to the end of the day */
  revenueMonth: number;
  /** now, exactly as the Revenue page */
  paying: number;
  mrr: number;
  trials: number;
  granted: number;
  /** trials ending before tomorrow is over, soonest first */
  trialsEnding: (Lead & { endsAt: Date; today: boolean })[];
  /** trials that ran out during the day, unpaid */
  trialsEnded: Lead[];
  whatsapp: {
    status: 'ok' | 'low' | 'empty' | 'unknown';
    balance: number | null;
    daysLeft: number | null;
    readAt: string | null;
    perDay: number;
    suggest: number;
    sent: number;
    spent: number;
    failed: number;
  };
}

/** Yesterday (Indian days) as of `now`, meant to run early in the morning. */
export async function gatherDailySummary(pool: Pool, now: Date): Promise<DailySummary> {
  const today = todayYmd(now);
  const day = addDays(today, -1);
  const [from, to] = [istStart(day), istStart(today)];
  const monthFrom = istStart(`${day.slice(0, 7)}-01`);
  const q = async <T>(sql: string, args: unknown[]) =>
    ((await pool.query(sql, args)) as unknown as [T[]])[0];
  const students = `(SELECT COUNT(*) FROM students st WHERE st.institute_id = i.id AND st.status = 'active')`;

  const signups = await q<{
    name: string;
    category: string;
    city: string | null;
    heard_from: string | null;
    heard_from_other: string | null;
    signup_channel: string | null;
    signup_phone: string | null;
    owner: string;
    phone: string | null;
    students: number;
  }>(
    `SELECT i.name, i.category, i.city, i.heard_from, i.heard_from_other, i.signup_channel, i.signup_phone,
            u.name AS owner, u.phone, ${students} AS students
       FROM institutes i JOIN users u ON u.id = i.owner_user_id
      WHERE i.created_at >= ? AND i.created_at < ? ORDER BY i.created_at`,
    [from, to],
  );
  const [counts] = await q<{ month: number; unfinished: number; revenue: number }>(
    `SELECT (SELECT COUNT(*) FROM institutes WHERE created_at >= ? AND created_at < ?) AS month,
            (SELECT COUNT(*) FROM users u WHERE u.created_at >= ? AND u.created_at < ?
                AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)) AS unfinished,
            (SELECT COALESCE(SUM(e.amount), 0) FROM billing_events e
              WHERE ${REAL_E} AND e.created_at >= ? AND e.created_at < ?) AS revenue`,
    [monthFrom, to, from, to, monthFrom, to],
  );
  const payments = await q<{
    centre: string | null;
    plan_id: string | null;
    cycle: string | null;
    amount: number;
    provider: string;
  }>(
    `SELECT i.name AS centre, e.plan_id, e.cycle, e.amount, e.provider
       FROM billing_events e LEFT JOIN institutes i ON i.id = e.institute_id
      WHERE ${REAL_E} AND e.created_at >= ? AND e.created_at < ? ORDER BY e.created_at`,
    [from, to],
  );
  const trialRows = (where: string, args: unknown[]) =>
    q<Lead & { expires_at: Date }>(
      `SELECT i.name, u.name AS owner, u.phone, ${students} AS students, s.expires_at
         FROM subscriptions s JOIN institutes i ON i.id = s.institute_id JOIN users u ON u.id = i.owner_user_id
        WHERE s.plan = 'trial' AND ${NOT_WAITING} AND ${where} ORDER BY s.expires_at`,
      ['trial', ...args],
    );
  const ending = await trialRows("s.status = 'active' AND s.expires_at > ? AND s.expires_at < ?", [
    now,
    istStart(addDays(today, 2)),
  ]);
  const ended = await trialRows('s.expires_at >= ? AND s.expires_at < ?', [from, to]);
  const [failed] = await q<{ n: number }>(
    `SELECT (SELECT COUNT(*) FROM messages WHERE status = 'failed' AND created_at >= ? AND created_at < ?)
          + (SELECT COUNT(*) FROM centre_messages WHERE status = 'failed' AND created_at >= ? AND created_at < ?) AS n`,
    [from, to, from, to],
  );

  const money = (await billingOverview(pool, billingQuery.parse({ limit: 1 }), now)).summary;
  const wa = await waSpend(pool, now, 8);
  const yesterday = wa.byDay.find((d) => d.day === day);
  const lead = (r: Lead): Lead => ({
    name: r.name,
    owner: r.owner,
    phone: r.phone,
    students: Number(r.students),
  });

  return {
    day,
    signups: signups.map((r) => ({
      ...lead(r),
      category: r.category,
      city: r.city,
      heardFrom: r.heard_from
        ? r.heard_from === 'other'
          ? r.heard_from_other || 'other'
          : (HEARD[r.heard_from] ?? r.heard_from)
        : null,
      channel:
        r.signup_channel === 'web'
          ? `website${r.signup_phone === 'ios' ? ' (iPhone)' : r.signup_phone === 'android' ? ' (Android)' : ''}`
          : 'app',
    })),
    signupsMonth: Number(counts?.month ?? 0),
    unfinished: Number(counts?.unfinished ?? 0),
    payments: payments.map((p) => ({
      centre: p.centre ?? 'Deleted centre',
      plan:
        (p.plan_id && isPlanId(p.plan_id) ? PLANS[p.plan_id].name : (p.plan_id ?? 'Plan')) +
        (p.cycle === 'year' ? ' yearly' : p.cycle === 'month' ? ' monthly' : ''),
      amount: Number(p.amount),
      source: SOURCE[p.provider] ?? 'website',
    })),
    revenueMonth: Number(counts?.revenue ?? 0),
    paying: money.paying,
    mrr: money.mrr,
    trials: money.trials,
    granted: money.granted,
    trialsEnding: ending.map((r) => ({
      ...lead(r),
      endsAt: r.expires_at,
      today: r.expires_at < istStart(addDays(today, 1)),
    })),
    trialsEnded: ended.map(lead),
    whatsapp: {
      status: wa.wallet.status as DailySummary['whatsapp']['status'],
      balance: wa.wallet.balance,
      daysLeft: wa.wallet.daysLeft,
      readAt: wa.wallet.readAt,
      perDay: wa.wallet.perDay,
      suggest: wa.wallet.suggest,
      sent: yesterday?.sent ?? 0,
      spent: yesterday?.paise ?? 0,
      failed: Number(failed?.n ?? 0),
    },
  };
}

// ---- the email ----

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString('en-IN')}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
/** "Wed, 4 Nov" */
const dayLabel = (ymd: string) =>
  new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
const clock = (d: Date) =>
  d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
const MAX_ROWS = 15;

/** A section: a heading, then one line per item (text and HTML kept apart so names are escaped once). */
interface Line {
  text: string;
  html: string;
}
const line = (parts: (string | null | false | undefined)[], phone?: string | null): Line => {
  const kept = parts.filter((p): p is string => !!p);
  return {
    text: [...kept, ...(phone ? [phone] : [])].join(' · '),
    html: [
      ...kept.map(esc),
      ...(phone ? [`<a href="tel:${esc(phone)}" style="color:#2563EB">${esc(phone)}</a>`] : []),
    ].join(' · '),
  };
};
const capped = (lines: Line[]): Line[] =>
  lines.length > MAX_ROWS
    ? [
        ...lines.slice(0, MAX_ROWS),
        {
          text: `and ${lines.length - MAX_ROWS} more`,
          html: `and ${lines.length - MAX_ROWS} more`,
        },
      ]
    : lines;
const studentsText = (n: number) => (n ? plural(n, 'student', 'students') : 'no students yet');

export function dailySummaryMail(s: DailySummary, dashboardUrl?: string): Omit<Mail, 'to'> {
  const w = s.whatsapp;
  const paid = s.payments.reduce((a, p) => a + p.amount, 0);
  const waLow = w.status === 'low' || w.status === 'empty';

  const subject =
    `Chalkpis daily · ${dayLabel(s.day)}: ` +
    [
      s.signups.length ? plural(s.signups.length, 'new centre', 'new centres') : 'no new centres',
      paid ? `${inr(paid)} paid` : 'no payments',
      ...(waLow
        ? [w.status === 'empty' ? 'WhatsApp balance run out' : 'WhatsApp balance low']
        : []),
    ].join(', ');

  const tiles: [string, string, string][] = [
    ['New centres', String(s.signups.length), `${s.signupsMonth} this month`],
    ['Paid yesterday', inr(paid), `${inr(s.revenueMonth)} this month`],
    ['Paying centres', String(s.paying), `MRR ${inr(s.mrr)} · ${s.trials} on trial`],
    [
      'WhatsApp balance',
      w.balance === null ? 'Not set' : inr(Math.max(0, w.balance)),
      w.daysLeft !== null
        ? `about ${plural(w.daysLeft, 'day', 'days')} left`
        : 'type it in on the dashboard',
    ],
  ];

  const sections: { title: string; note?: string; lines: Line[]; alert?: boolean }[] = [];
  sections.push({
    title: `New centres (${s.signups.length})`,
    lines: [
      ...capped(
        s.signups.map((c) =>
          line(
            [
              `${c.name} (${c.category})`,
              c.owner || null,
              c.city,
              c.heardFrom && `heard from ${c.heardFrom}`,
              c.channel,
              studentsText(c.students),
            ],
            c.phone,
          ),
        ),
      ),
      ...(s.unfinished
        ? [
            line([
              `${plural(s.unfinished, 'number was', 'numbers were')} verified but no centre set up yet`,
            ]),
          ]
        : []),
    ],
    note: s.signups.length || s.unfinished ? undefined : 'No new centres yesterday.',
  });
  sections.push({
    title: `Plan payments (${s.payments.length})`,
    lines: capped(s.payments.map((p) => line([p.centre, p.plan, inr(p.amount), p.source]))),
    note: s.payments.length ? undefined : 'No plan payments yesterday.',
  });
  if (s.trialsEnding.length)
    sections.push({
      title: `Trials ending today or tomorrow (${s.trialsEnding.length})`,
      lines: capped(
        s.trialsEnding.map((t) =>
          line(
            [
              t.name,
              t.owner || null,
              studentsText(t.students),
              t.today ? `ends today ${clock(t.endsAt)}` : 'ends tomorrow',
            ],
            t.phone,
          ),
        ),
      ),
    });
  if (s.trialsEnded.length)
    sections.push({
      title: `Trials that ended without paying (${s.trialsEnded.length})`,
      lines: capped(
        s.trialsEnded.map((t) =>
          line([t.name, t.owner || null, studentsText(t.students)], t.phone),
        ),
      ),
    });
  const waLines: Line[] = [];
  if (w.balance === null)
    waLines.push(
      line(['No balance recorded. Type the wa.adsme.in balance in on WhatsApp > Spend & balance.']),
    );
  else {
    waLines.push(
      line([
        `About ${inr(Math.max(0, w.balance))} left` +
          (w.daysLeft !== null ? `, enough for about ${plural(w.daysLeft, 'day', 'days')}` : '') +
          (w.perDay ? ` at ${inr(w.perDay)} a day` : ''),
        w.readAt ? `estimate from the balance typed in on ${shortDate(w.readAt)}` : null,
      ]),
    );
    if (waLow)
      waLines.push(
        line([
          w.status === 'empty'
            ? 'It has run out: login codes and parent messages stop until it is recharged at wa.adsme.in.'
            : `Recharge at wa.adsme.in soon${w.suggest ? `: ${inr(w.suggest)} covers the next 30 days` : ''}.`,
        ]),
      );
  }
  waLines.push(
    line([
      `Yesterday: ${plural(w.sent, 'message', 'messages')}, about ${inr(w.spent)}`,
      w.failed ? `${w.failed} failed` : 'none failed',
    ]),
  );
  sections.push({ title: 'WhatsApp', lines: waLines, alert: waLow || w.failed > 0 });

  const link = dashboardUrl ? `${dashboardUrl.replace(/\/+$/, '')}/admin` : null;
  const text = [
    `Chalkpis on ${dayLabel(s.day)}`,
    '',
    ...tiles.map(([k, v, sub]) => `${k}: ${v} (${sub})`),
    ...(s.granted ? [`Plans given by an admin (not paying): ${s.granted}`] : []),
    ...sections.flatMap((x) => [
      '',
      x.title,
      ...(x.note ? [x.note] : x.lines.map((l) => `- ${l.text}`)),
    ]),
    '',
    ...(link ? [`Dashboard: ${link}`] : []),
    'Chalkpis Admin · M2W Technologies Private Limited',
  ].join('\n');

  const tile = ([k, v, sub]: [string, string, string], red: boolean) =>
    `<td width="50%" style="padding:6px;vertical-align:top"><div style="border:1px solid ${red ? '#FCA5A5' : '#E5E5E5'};background:${red ? '#FEF2F2' : '#FFFFFF'};border-radius:10px;padding:12px 14px">` +
    `<div style="font-size:12px;color:#737373">${esc(k)}</div>` +
    `<div style="font-size:22px;font-weight:700;color:${red ? '#B91C1C' : '#0F2D40'};margin-top:2px">${esc(v)}</div>` +
    `<div style="font-size:12px;color:#737373;margin-top:2px">${esc(sub)}</div></div></td>`;
  const html =
    `<div style="background:#F5F5F4;padding:16px 8px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#262626">` +
    `<div style="max-width:560px;margin:auto;background:#FFFFFF;border-radius:14px;padding:20px 16px">` +
    `<div style="font-size:13px;color:#737373">Chalkpis daily report</div>` +
    `<div style="font-size:20px;font-weight:700;color:#0F2D40;margin:2px 0 12px">${esc(dayLabel(s.day))}</div>` +
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">` +
    `<tr>${tile(tiles[0]!, false)}${tile(tiles[1]!, false)}</tr>` +
    `<tr>${tile(tiles[2]!, false)}${tile(tiles[3]!, waLow)}</tr></table>` +
    (s.granted
      ? `<p style="font-size:12px;color:#737373;margin:6px 6px 0">Plans given by an admin (not paying): ${s.granted}</p>`
      : '') +
    sections
      .map(
        (x) =>
          `<div style="margin-top:18px;padding:0 6px"><div style="font-size:14px;font-weight:700;color:${x.alert ? '#B91C1C' : '#0F2D40'};border-bottom:1px solid #E5E5E5;padding-bottom:6px">${esc(x.title)}</div>` +
          (x.note
            ? `<p style="font-size:13px;color:#737373;margin:8px 0 0">${esc(x.note)}</p>`
            : x.lines
                .map(
                  (l) => `<p style="font-size:13px;line-height:1.5;margin:8px 0 0">${l.html}</p>`,
                )
                .join('')) +
          `</div>`,
      )
      .join('') +
    (link
      ? `<div style="margin-top:22px;padding:0 6px"><a href="${esc(link)}" style="display:inline-block;background:#0F2D40;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:8px">Open the dashboard</a></div>`
      : '') +
    `<p style="font-size:12px;color:#A3A3A3;margin:22px 6px 0">Chalkpis Admin · M2W Technologies Private Limited</p>` +
    `</div></div>`;

  return { subject, text, html };
}

/**
 * The daily job: emails the summary to the super admins. The scheduler runs it once a day (job_runs), so there is no
 * mark of its own. A failed send is not retried, so a wrong SMTP password does not try to sign in every minute.
 * Returns how many emails went.
 */
export async function sendDailySummary(
  pool: Pool,
  mailer: Mailer | null,
  emails: string[],
  now: Date,
  dashboardUrl?: string,
): Promise<number> {
  if (!mailer || !emails.length) return 0;
  const mail = dailySummaryMail(await gatherDailySummary(pool, now), dashboardUrl);
  let sent = 0;
  for (const to of emails) if (await mailer.send({ to, ...mail })) sent++;
  return sent;
}
