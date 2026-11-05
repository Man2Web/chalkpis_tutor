import { z } from 'zod';
import type { Pool } from '../db.js';
import { notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import { addDays, todayYmd } from '../lib/ist.js';
import type { Mailer } from '../auth/mailer.js';

/**
 * WhatsApp spend and the gateway wallet (decision 159).
 * - Spend is an estimate: messages the gateway accepted (wa_usage, counted at send time) times what the gateway charges
 *   for that kind's WhatsApp category (utility, authentication or marketing), set on the dashboard.
 * - The balance: the newest reading copied from wa.adsme.in, plus recharges after it, less the spend since. Without a
 *   reading, the recharges less the spend since the first one. Nothing recorded: unknown.
 * - Days left: the balance over the average daily spend of the last 7 full days; "low" once that is at or under the
 *   warning days or the balance under the warning amount. The super admins get one email a day while it is low.
 */
export type Category = 'utility' | 'authentication' | 'marketing';
export const CATEGORIES: Category[] = ['utility', 'authentication', 'marketing'];

/** Every kind the server sends, in plain words, for the dashboard. */
export const KINDS: Record<string, string> = {
  login_code: 'Login codes',
  absent: 'Absent alerts',
  late: 'Late alerts',
  fee_due: 'Fee due soon',
  fee_overdue: 'Fee overdue',
  payment_received: 'Payment receipts',
  fee_reminder: 'Fee reminders (QR)',
  fee_link: 'Fee pay links',
  parent_link: 'Parent page links',
  student_welcome: 'Student welcome',
  class_cancelled: 'Class cancelled',
  centre_welcome: 'Centre welcome',
  trial_ending: 'Trial ending (old)',
  plan_active: 'Plan active',
  plan_ending: 'Plan ending reminder',
  plan_ended: 'Plan ended reminder',
  helper_invite: 'Helper invites',
  daily_report: 'Daily reports to owners',
};
/** As Meta classed the templates (docs/WHATSAPP-TEMPLATES.md): the plan reminders ask the owner to buy, so Marketing. */
const MARKETING = new Set(['plan_ending', 'plan_ended']);
const defaultCategory = (kind: string): Category =>
  kind === 'login_code' ? 'authentication' : MARKETING.has(kind) ? 'marketing' : 'utility';

export const ratesBody = z.object({
  utility: z.number().min(0).max(1000),
  authentication: z.number().min(0).max(1000),
  marketing: z.number().min(0).max(1000),
  /** kinds that are not their default category */
  categories: z
    .record(z.string().max(30), z.enum(['utility', 'authentication', 'marketing']))
    .default({}),
  warnDays: z.number().int().min(1).max(60),
  warnBelow: z.number().int().min(0).max(100_000_000),
});
export const walletBody = z.object({
  kind: z.enum(['recharge', 'balance']),
  /** paise */
  amount: z.number().int().min(0).max(1_000_000_000),
  note: z.string().trim().max(200).default(''),
});

interface Settings {
  rates: Record<Category, number>;
  categories: Record<string, Category>;
  warnDays: number;
  warnBelow: number;
  lastWarnedAt: Date | null;
  updatedBy: string;
  updatedAt: string;
}
async function settings(pool: Pool): Promise<Settings> {
  const [[r]] = (await pool.query(
    'SELECT utility_paise, authentication_paise, marketing_paise, categories, warn_days, warn_below_paise, last_warned_at, updated_by, updated_at FROM wa_billing WHERE id = 1',
  )) as unknown as [
    [
      | {
          utility_paise: string;
          authentication_paise: string;
          marketing_paise: string;
          categories: string;
          warn_days: number;
          warn_below_paise: number;
          last_warned_at: Date | null;
          updated_by: string;
          updated_at: Date;
        }
      | undefined,
    ],
  ];
  let categories: Record<string, Category> = {};
  try {
    categories = JSON.parse(r?.categories ?? '{}') as Record<string, Category>;
  } catch {
    /* a damaged value counts every kind at its default */
  }
  return {
    rates: {
      utility: Number(r?.utility_paise ?? 20),
      authentication: Number(r?.authentication_paise ?? 20),
      marketing: Number(r?.marketing_paise ?? 95),
    },
    categories,
    warnDays: Number(r?.warn_days ?? 7),
    warnBelow: Number(r?.warn_below_paise ?? 50000),
    lastWarnedAt: r?.last_warned_at ?? null,
    updatedBy: r?.updated_by ?? '',
    updatedAt: (r?.updated_at ?? new Date(0)).toISOString(),
  };
}

const categoryOf = (s: Settings, kind: string) => s.categories[kind] ?? defaultCategory(kind);
const costOf = (s: Settings, kind: string) => s.rates[categoryOf(s, kind)];
/** The rate of each kind, as SQL, so sums happen in the database: CASE kind WHEN ... THEN rate ... END. */
function rateSql(s: Settings) {
  const kinds = new Set([...Object.keys(KINDS), ...Object.keys(s.categories).filter(safeKind)]);
  const whens = [...kinds].map(
    (k) => `WHEN ${JSON.stringify(k).replace(/"/g, "'")} THEN ${costOf(s, k)}`,
  );
  return `(CASE kind ${whens.join(' ')} ELSE ${s.rates.utility} END)`;
}
const safeKind = (k: string) => /^[a-z_]{1,30}$/.test(k);

interface Wallet {
  balance: number | null;
  /** when the balance was last read from the gateway */
  readAt: string | null;
  rechargedSince: number;
  spentSince: number;
  entries: {
    id: string;
    kind: 'recharge' | 'balance';
    amount: number;
    note: string;
    at: string;
    by: string;
  }[];
}

async function wallet(pool: Pool, s: Settings, now: Date): Promise<Wallet> {
  const [rows] = (await pool.query(
    'SELECT id, kind, amount_paise, day_spent_paise, note, at, created_by FROM wa_wallet ORDER BY at DESC LIMIT 200',
  )) as unknown as [
    {
      id: string;
      kind: 'recharge' | 'balance';
      amount_paise: number;
      day_spent_paise: string;
      note: string;
      at: Date;
      created_by: string;
    }[],
  ];
  const entries = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    amount: Number(r.amount_paise),
    note: r.note,
    at: r.at.toISOString(),
    by: r.created_by,
  }));
  if (!rows.length)
    return { balance: null, readAt: null, rechargedSince: 0, spentSince: 0, entries };
  const reading = rows.find((r) => r.kind === 'balance');
  // the starting point: the newest reading, else the first recharge (with nothing before it)
  const start = reading ?? rows[rows.length - 1]!;
  const startDay = todayYmd(start.at);
  const rechargedSince = rows
    .filter((r) => r.kind === 'recharge' && (reading ? r.at > reading.at : true))
    .reduce((a, r) => a + Number(r.amount_paise), 0);
  const [[spent]] = (await pool.query(
    `SELECT COALESCE(SUM(sent * ${rateSql(s)}), 0) AS paise FROM wa_usage WHERE day >= ? AND day <= ?`,
    [startDay, todayYmd(now)],
  )) as unknown as [[{ paise: string }]];
  const spentSince = Math.max(0, Number(spent?.paise ?? 0) - Number(start.day_spent_paise));
  const base = reading ? Number(reading.amount_paise) : 0;
  return {
    balance: Math.round(base + rechargedSince - spentSince),
    readAt: reading?.at.toISOString() ?? null,
    rechargedSince,
    spentSince: Math.round(spentSince),
    entries,
  };
}

/** The spend of one Indian day so far, for a balance reading taken now. */
async function spentToday(pool: Pool, s: Settings, now: Date) {
  const [[r]] = (await pool.query(
    `SELECT COALESCE(SUM(sent * ${rateSql(s)}), 0) AS paise FROM wa_usage WHERE day = ?`,
    [todayYmd(now)],
  )) as unknown as [[{ paise: string }]];
  return Number(r?.paise ?? 0);
}

/** Everything the WhatsApp spend screen shows. */
export async function waSpend(pool: Pool, now: Date, days = 30) {
  const s = await settings(pool);
  const today = todayYmd(now);
  const from = addDays(today, -(days - 1));
  const monthStart = `${today.slice(0, 7)}-01`;
  const lastMonthStart = `${addDays(monthStart, -1).slice(0, 7)}-01`;
  const rate = rateSql(s);
  const [dayRows] = (await pool.query(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') d, SUM(sent) n, SUM(sent * ${rate}) paise FROM wa_usage
      WHERE day >= ? GROUP BY day`,
    [from],
  )) as unknown as [{ d: string; n: string; paise: string }[]];
  const byDayMap = new Map(
    dayRows.map((r) => [r.d, { sent: Number(r.n), paise: Number(r.paise) }]),
  );
  const byDay = Array.from({ length: days }, (_, i) => {
    const d = addDays(from, i);
    const v = byDayMap.get(d);
    return { day: d, sent: v?.sent ?? 0, paise: Math.round(v?.paise ?? 0) };
  });
  const [kindRows] = (await pool.query(
    'SELECT kind, SUM(sent) n FROM wa_usage WHERE day >= ? GROUP BY kind ORDER BY n DESC',
    [from],
  )) as unknown as [{ kind: string; n: string }[]];
  const [[periods]] = (await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN day = ? THEN sent * ${rate} END), 0) today,
            COALESCE(SUM(CASE WHEN day >= ? THEN sent * ${rate} END), 0) month,
            COALESCE(SUM(CASE WHEN day >= ? AND day < ? THEN sent * ${rate} END), 0) last_month,
            COALESCE(SUM(CASE WHEN day >= ? AND day < ? THEN sent * ${rate} END), 0) week,
            COALESCE(SUM(CASE WHEN day >= ? AND day < ? THEN sent END), 0) week_days,
            COALESCE(SUM(CASE WHEN day = ? THEN sent END), 0) today_sent,
            COALESCE(SUM(CASE WHEN day >= ? THEN sent END), 0) month_sent
       FROM wa_usage WHERE day >= ?`,
    [
      today,
      monthStart,
      lastMonthStart,
      monthStart,
      addDays(today, -7),
      today,
      addDays(today, -7),
      today,
      today,
      monthStart,
      lastMonthStart,
    ],
  )) as unknown as [[Record<string, string>]];
  const p = (k: string) => Number(periods?.[k] ?? 0);
  const burn = p('week') / 7; // paise a day, from the last 7 full days
  const w = await wallet(pool, s, now);
  const daysLeft = w.balance === null || burn <= 0 ? null : Math.max(0, w.balance) / burn;
  const status =
    w.balance === null
      ? 'unknown'
      : w.balance <= 0
        ? 'empty'
        : (daysLeft !== null && daysLeft <= s.warnDays) || w.balance < s.warnBelow
          ? 'low'
          : 'ok';
  const runsOutOn = daysLeft === null ? null : addDays(today, Math.floor(daysLeft));
  // enough for the next 30 days, rounded up to Rs 500
  const suggest = burn > 0 ? Math.ceil((burn * 30) / 50000) * 50000 : 0;
  return {
    rates: s.rates,
    categories: Object.fromEntries(Object.keys(KINDS).map((k) => [k, categoryOf(s, k)])) as Record<
      string,
      Category
    >,
    kinds: KINDS,
    warnDays: s.warnDays,
    warnBelow: s.warnBelow,
    updatedBy: s.updatedBy,
    wallet: {
      status,
      balance: w.balance,
      readAt: w.readAt,
      rechargedSince: w.rechargedSince,
      spentSince: w.spentSince,
      perDay: Math.round(burn),
      daysLeft: daysLeft === null ? null : Math.floor(daysLeft),
      runsOutOn,
      rechargeBy: runsOutOn ? addDays(runsOutOn, -Math.min(3, Math.floor(daysLeft ?? 0))) : null,
      suggest,
      entries: w.entries.slice(0, 30),
    },
    totals: {
      today: Math.round(p('today')),
      todaySent: p('today_sent'),
      month: Math.round(p('month')),
      monthSent: p('month_sent'),
      lastMonth: Math.round(p('last_month')),
    },
    byDay,
    byKind: kindRows.map((r) => ({
      kind: r.kind,
      label: KINDS[r.kind] ?? r.kind,
      category: categoryOf(s, r.kind),
      sent: Number(r.n),
      paise: Math.round(Number(r.n) * costOf(s, r.kind)),
    })),
  };
}

/** Spend per centre over the last `days` days, biggest first, with what each paid us for its plan. */
export async function waSpendByCentre(pool: Pool, now: Date, days = 30, limit = 200) {
  const s = await settings(pool);
  const from = addDays(todayYmd(now), -(days - 1));
  const [rows] = (await pool.query(
    `SELECT w.institute_id, i.name, sb.plan, SUM(w.sent) n, SUM(w.sent * ${rateSql(s)}) paise,
            SUM(CASE WHEN w.kind = 'login_code' THEN w.sent ELSE 0 END) codes
       FROM wa_usage w
       LEFT JOIN institutes i ON i.id = w.institute_id
       LEFT JOIN subscriptions sb ON sb.institute_id = w.institute_id
      WHERE w.day >= ?
      GROUP BY w.institute_id, i.name, sb.plan
      ORDER BY paise DESC LIMIT ?`,
    [from, limit],
  )) as unknown as [
    {
      institute_id: string;
      name: string | null;
      plan: string | null;
      n: string;
      paise: string;
      codes: string;
    }[],
  ];
  return {
    days,
    centres: rows.map((r) => ({
      id: r.institute_id || null,
      name: r.institute_id ? (r.name ?? 'Deleted centre') : 'Not in a centre yet',
      deleted: !!r.institute_id && r.name === null,
      plan: r.plan,
      sent: Number(r.n),
      loginCodes: Number(r.codes),
      paise: Math.round(Number(r.paise)),
    })),
  };
}

/** One centre's WhatsApp: the last 30 days by kind, and the total since metering began. */
export async function waSpendForCentre(pool: Pool, instituteId: string, now: Date) {
  const s = await settings(pool);
  const from = addDays(todayYmd(now), -29);
  const [rows] = (await pool.query(
    `SELECT kind, SUM(CASE WHEN day >= ? THEN sent ELSE 0 END) n30, SUM(sent) n FROM wa_usage
      WHERE institute_id = ? GROUP BY kind ORDER BY n30 DESC`,
    [from, instituteId],
  )) as unknown as [{ kind: string; n30: string; n: string }[]];
  const kinds = rows.map((r) => ({
    kind: r.kind,
    label: KINDS[r.kind] ?? r.kind,
    sent30: Number(r.n30),
    paise30: Math.round(Number(r.n30) * costOf(s, r.kind)),
  }));
  return {
    sent30: kinds.reduce((a, k) => a + k.sent30, 0),
    paise30: kinds.reduce((a, k) => a + k.paise30, 0),
    paiseAll: Math.round(rows.reduce((a, r) => a + Number(r.n) * costOf(s, r.kind), 0)),
    kinds: kinds.filter((k) => k.sent30 > 0),
  };
}

export async function setRates(pool: Pool, by: string, b: z.infer<typeof ratesBody>, now: Date) {
  const categories = Object.fromEntries(
    Object.entries(b.categories).filter(([k, c]) => safeKind(k) && c !== defaultCategory(k)),
  );
  const v = [
    b.utility,
    b.authentication,
    b.marketing,
    JSON.stringify(categories),
    b.warnDays,
    b.warnBelow,
    by,
    now,
  ];
  await pool.query(
    `INSERT INTO wa_billing (id, utility_paise, authentication_paise, marketing_paise, categories, warn_days,
            warn_below_paise, updated_by, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE utility_paise = ?, authentication_paise = ?, marketing_paise = ?, categories = ?,
            warn_days = ?, warn_below_paise = ?, updated_by = ?, updated_at = ?`,
    [...v, ...v],
  );
}

export async function addWalletEntry(
  pool: Pool,
  by: string,
  b: z.infer<typeof walletBody>,
  now: Date,
) {
  const s = await settings(pool);
  const id = newId();
  await pool.query(
    'INSERT INTO wa_wallet (id, kind, amount_paise, day_spent_paise, note, at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      b.kind,
      b.amount,
      b.kind === 'balance' ? await spentToday(pool, s, now) : 0,
      b.note,
      now,
      by,
    ],
  );
  return { id };
}

export async function deleteWalletEntry(pool: Pool, id: string) {
  const [res] = (await pool.query('DELETE FROM wa_wallet WHERE id = ?', [id])) as unknown as [
    { affectedRows: number },
  ];
  if (!res.affectedRows) throw notFound();
}

const inr = (paise: number) => `Rs ${Math.round(paise / 100).toLocaleString('en-IN')}`;

/**
 * The daily check: while the balance is low or empty, the super admins get one email a day with what is left, how
 * long it lasts and how much to add. Returns 1 when it emailed.
 */
export async function warnLowBalance(
  pool: Pool,
  mailer: Mailer | null,
  emails: string[],
  now: Date,
): Promise<number> {
  if (!mailer || !emails.length) return 0;
  const s = await waSpend(pool, now, 8);
  const w = s.wallet;
  if (w.status !== 'low' && w.status !== 'empty') return 0;
  const [[row]] = (await pool.query(
    'SELECT last_warned_at FROM wa_billing WHERE id = 1',
  )) as unknown as [[{ last_warned_at: Date | null } | undefined]];
  if (row?.last_warned_at && now.getTime() - row.last_warned_at.getTime() < 20 * 3_600_000)
    return 0;
  const lines = [
    w.status === 'empty'
      ? 'The WhatsApp balance at wa.adsme.in has run out (estimated). Login codes and parent messages stop until it is recharged.'
      : `The WhatsApp balance at wa.adsme.in is low: about ${inr(w.balance ?? 0)} left${
          w.daysLeft !== null
            ? `, enough for about ${w.daysLeft} day${w.daysLeft === 1 ? '' : 's'}`
            : ''
        }.`,
    `Chalkpis spends about ${inr(w.perDay)} a day on WhatsApp.${w.suggest ? ` ${inr(w.suggest)} covers the next 30 days.` : ''}`,
    'Recharge at wa.adsme.in, then record it in the admin dashboard (WhatsApp > Spend & balance > Recharged) so the estimate stays right.',
  ];
  let sent = 0;
  for (const to of emails)
    if (
      await mailer.send({
        to,
        subject:
          w.status === 'empty'
            ? 'Chalkpis WhatsApp balance has run out'
            : 'Recharge the Chalkpis WhatsApp balance soon',
        text: [...lines, '', 'Chalkpis Admin · M2W Technologies Private Limited'].join('\n'),
        html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#262626">${lines
          .map((l) => `<p style="font-size:14px;line-height:1.5">${l.replace(/[<>&]/g, '')}</p>`)
          .join(
            '',
          )}<p style="font-size:12px;color:#a3a3a3;margin-top:24px">Chalkpis Admin · M2W Technologies Private Limited</p></div>`,
      })
    )
      sent++;
  if (sent)
    await pool.query(
      'INSERT INTO wa_billing (id, last_warned_at) VALUES (1, ?) ON DUPLICATE KEY UPDATE last_warned_at = ?',
      [now, now],
    );
  return sent ? 1 : 0;
}
