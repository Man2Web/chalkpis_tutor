import { z } from 'zod';
import type { Pool } from '../db.js';
import { notFound } from '../errors.js';
import { CATEGORIES } from '../institutes/category.js';
import { newId } from '../lib/ids.js';
import { normalizeIndianPhone } from '../lib/phone.js';
import type { PushSender } from '../push/expo.js';

const DAY = 86_400_000;
const IST = 5.5 * 3_600_000;

export const ANN_CATEGORIES = [
  'update',
  'feature',
  'maintenance',
  'billing',
  'tip',
  'policy',
] as const;
export const ANN_PRIORITIES = ['normal', 'important', 'critical'] as const;
/** Screens in the app a call-to-action may open (the app knows these names). */
export const ANN_SCREENS = [
  '',
  'Home',
  'Students',
  'Attendance',
  'Fees',
  'Billing',
  'Updates',
] as const;

const httpsLink = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s<>"]+$/i.test(v))
  .default('');

export const audienceInput = z.object({
  /** Who by role: owners (tutors), staff (helpers) or both. */
  audience: z.enum(['all', 'owners', 'staff']).default('all'),
  /** Which centres by plan: on a free trial, paying, or whose plan has ended. */
  plan: z.enum(['any', 'trial', 'paid', 'ended']).default('any'),
  /** Which kind of centre (tuition, karate…); empty = every kind. */
  centreCategory: z.union([z.literal(''), z.enum(CATEGORIES)]).default(''),
});

export const announcementInput = audienceInput.extend({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().max(400).default(''),
  category: z.enum(ANN_CATEGORIES).default('update'),
  priority: z.enum(ANN_PRIORITIES).default('normal'),
  /** Older dashboards send a colour; newer ones let it follow the category and priority. */
  tone: z.enum(['info', 'success', 'warning']).optional(),
  ctaLabel: z.string().trim().max(30).default(''),
  link: httpsLink,
  screen: z.enum(ANN_SCREENS).default(''),
  /** Channels: the banner on Home (and the Updates inbox), and a push notification. */
  banner: z.boolean().default(true),
  push: z.boolean().default(false),
  /** When it starts; null = now. */
  startsAt: z.string().datetime({ offset: true }).nullable().default(null),
  /** How long the banner shows; null = until taken down. */
  days: z.number().int().min(1).max(365).nullable().default(7),
});
export type AnnouncementInput = z.infer<typeof announcementInput>;
export type AudienceInput = z.infer<typeof audienceInput>;

/** The banner colour: critical and maintenance warn, new features are good news, the rest inform. */
export const toneFor = (a: Pick<AnnouncementInput, 'category' | 'priority' | 'tone'>) =>
  a.tone ??
  (a.priority === 'critical' || a.category === 'maintenance'
    ? 'warning'
    : a.category === 'feature'
      ? 'success'
      : 'info');

/**
 * Quiet hours: a push is never delivered between 9 pm and 8 am IST (it waits for 8 am), except a critical one.
 * Returns when the push should go.
 */
export function pushTime(at: Date, priority: string): Date {
  if (priority === 'critical') return at;
  const ist = new Date(at.getTime() + IST);
  const h = ist.getUTCHours();
  if (h >= 8 && h < 21) return at;
  const day = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + (h >= 21 ? 1 : 0),
    8,
  );
  return new Date(day - IST);
}

/** The people an announcement reaches: SQL over users u, memberships m, institutes i, subscriptions s. */
function audienceSql(a: AudienceInput, now: Date) {
  const roles =
    a.audience === 'owners' ? ['owner'] : a.audience === 'staff' ? ['staff'] : ['owner', 'staff'];
  const where = ['u.blocked_at IS NULL', 'm.role IN (?)'];
  const args: unknown[] = [roles];
  if (a.plan === 'trial') {
    where.push("s.plan = 'trial' AND s.status = 'active' AND s.expires_at > ?");
    args.push(now);
  } else if (a.plan === 'paid') {
    where.push("s.plan <> 'trial' AND s.status = 'active' AND s.expires_at > ?");
    args.push(now);
  } else if (a.plan === 'ended') {
    where.push("(s.status = 'expired' OR s.expires_at <= ?)");
    args.push(now);
  }
  if (a.centreCategory) {
    where.push('i.category = ?');
    args.push(a.centreCategory);
  }
  return {
    from: `FROM users u JOIN memberships m ON m.user_id = u.id JOIN institutes i ON i.id = m.institute_id
           LEFT JOIN subscriptions s ON s.institute_id = i.id`,
    where: where.join(' AND '),
    args,
  };
}

/** How many people an audience is, and how many phones with notifications switched on it has. */
export async function estimateAudience(pool: Pool, a: AudienceInput, now: Date) {
  const q = audienceSql(a, now);
  const [[r]] = (await pool.query(
    `SELECT COUNT(DISTINCT u.id) AS people, COUNT(DISTINCT t.token) AS phones
       ${q.from} LEFT JOIN push_tokens t ON t.user_id = u.id WHERE ${q.where}`,
    q.args,
  )) as unknown as [[{ people: number; phones: number }]];
  return { people: Number(r?.people ?? 0), phones: Number(r?.phones ?? 0) };
}

interface Row {
  id: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  tone: string;
  audience: 'all' | 'owners' | 'staff';
  plan_filter: 'any' | 'trial' | 'paid' | 'ended';
  centre_category: string;
  show_banner: number;
  push: number;
  push_status: string;
  push_at: Date | null;
  push_sent_at: Date | null;
  push_phones: number;
  push_sent: number;
  audience_size: number | null;
  link: string;
  cta_label: string;
  screen: string;
  starts_at: Date;
  ends_at: Date | null;
  created_by: string;
  created_at: Date;
}

const audienceOf = (r: Row): AudienceInput => ({
  audience: r.audience,
  plan: r.plan_filter,
  centreCategory: (r.centre_category || '') as AudienceInput['centreCategory'],
});

export async function createAnnouncement(
  pool: Pool,
  actor: { userId: string | null; phone: string },
  b: AnnouncementInput,
  now: Date,
) {
  const id = newId();
  const starts = b.startsAt ? new Date(Math.max(Date.parse(b.startsAt), now.getTime())) : now;
  const ends = b.days ? new Date(starts.getTime() + b.days * DAY) : null;
  const pushAt = b.push ? pushTime(starts, b.priority) : null;
  const size = (await estimateAudience(pool, b, now)).people;
  await pool.query(
    `INSERT INTO announcements (id, title, body, category, priority, tone, audience, plan_filter, centre_category,
       show_banner, push, push_status, push_at, audience_size, link, cta_label, screen, starts_at, ends_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      b.title,
      b.body,
      b.category,
      b.priority,
      toneFor(b),
      b.audience,
      b.plan,
      b.centreCategory,
      b.banner ? 1 : 0,
      b.push ? 1 : 0,
      b.push ? 'scheduled' : 'none',
      pushAt,
      size,
      b.link,
      b.ctaLabel,
      b.screen,
      starts,
      ends,
      actor.phone,
    ],
  );
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, detail) VALUES (?, ?, ?, ?, ?)',
    [newId(), actor.userId, actor.phone, 'announce', b.title],
  );
  return {
    id,
    startsAt: starts.toISOString(),
    pushAt: pushAt?.toISOString() ?? null,
    audience: size,
  };
}

/** Takes an announcement down now; a push that has not gone yet is cancelled. */
export async function endAnnouncement(
  pool: Pool,
  actor: { userId: string | null; phone: string },
  id: string,
  now: Date,
) {
  const [r] = (await pool.query(
    "UPDATE announcements SET ends_at = ?, push_status = IF(push_status = 'scheduled', 'cancelled', push_status) WHERE id = ?",
    [now, id],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, detail) VALUES (?, ?, ?, ?, ?)',
    [newId(), actor.userId, actor.phone, 'end-announcement', id],
  );
}

/**
 * Sends the pushes that are due (scheduled time reached, announcement not taken down), each exactly once even with
 * several workers: one claims it by moving it from scheduled to sending. Returns how many announcements went out.
 */
export async function dispatchDuePushes(pool: Pool, sender: PushSender | null, now: Date) {
  if (!sender) return 0;
  const [due] = (await pool.query(
    "SELECT * FROM announcements WHERE push_status = 'scheduled' AND push_at <= ? ORDER BY push_at LIMIT 5",
    [now],
  )) as unknown as [Row[]];
  let n = 0;
  for (const a of due) {
    const [claim] = (await pool.query(
      "UPDATE announcements SET push_status = 'sending' WHERE id = ? AND push_status = 'scheduled'",
      [a.id],
    )) as unknown as [{ affectedRows: number }];
    if (claim.affectedRows !== 1) continue;
    if (a.ends_at && a.ends_at <= now) {
      await pool.query("UPDATE announcements SET push_status = 'cancelled' WHERE id = ?", [a.id]);
      continue;
    }
    const q = audienceSql(audienceOf(a), now);
    const [tokens] = (await pool.query(
      `SELECT DISTINCT t.token FROM push_tokens t WHERE t.user_id IN (SELECT u.id ${q.from} WHERE ${q.where})`,
      q.args,
    )) as unknown as [{ token: string }[]];
    const [[people]] = (await pool.query(
      `SELECT COUNT(DISTINCT u.id) AS n ${q.from} WHERE ${q.where}`,
      q.args,
    )) as unknown as [[{ n: number }]];
    let sent = 0;
    if (tokens.length) {
      const results = await sender.send(
        tokens.map((t) => ({
          to: t.token,
          title: a.title,
          body: a.body || 'Open Chalkpis to read it.',
          data: { screen: 'Updates', announcementId: a.id },
        })),
      );
      sent = results.filter((x) => !x.error).length;
      const gone = results.filter((x) => x.error === 'DeviceNotRegistered').map((x) => x.to);
      if (gone.length) await pool.query('DELETE FROM push_tokens WHERE token IN (?)', [gone]);
    }
    await pool.query(
      "UPDATE announcements SET push_status = 'sent', push_sent_at = ?, push_phones = ?, push_sent = ?, audience_size = ? WHERE id = ?",
      [now, tokens.length, sent, Number(people?.n ?? 0), a.id],
    );
    n++;
  }
  return n;
}

/** A test push to one person's phones (by mobile number), before sending to everyone. Nothing is logged as sent. */
export async function testPush(
  pool: Pool,
  sender: PushSender | null,
  rawPhone: string,
  m: { title: string; body: string },
) {
  const phone = normalizeIndianPhone(rawPhone);
  if (!phone) return { found: false, phones: 0, sent: 0 };
  const [users] = (await pool.query('SELECT id FROM users WHERE phone = ?', [
    phone,
  ])) as unknown as [{ id: string }[]];
  if (!users[0]) return { found: false, phones: 0, sent: 0 };
  const [tokens] = (await pool.query('SELECT token FROM push_tokens WHERE user_id = ?', [
    users[0].id,
  ])) as unknown as [{ token: string }[]];
  if (!tokens.length || !sender) return { found: true, phones: tokens.length, sent: 0 };
  const results = await sender.send(
    tokens.map((t) => ({
      to: t.token,
      title: m.title,
      body: m.body || 'Open Chalkpis to read it.',
      data: { screen: 'Updates' },
    })),
  );
  return { found: true, phones: tokens.length, sent: results.filter((x) => !x.error).length };
}

// ---------- the dashboard list, with what happened to each ----------

export async function listForAdmin(pool: Pool, now: Date) {
  const [rows] = (await pool.query(
    'SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100',
  )) as unknown as [Row[]];
  const [stats] = (await pool.query(
    `SELECT announcement_id AS id, COUNT(seen_at) AS seen, COUNT(clicked_at) AS clicked, COUNT(dismissed_at) AS dismissed,
            COUNT(opened_at) AS opened
       FROM announcement_events GROUP BY announcement_id`,
  )) as unknown as [
    { id: string; seen: number; clicked: number; dismissed: number; opened: number }[],
  ];
  const by = new Map(stats.map((s) => [s.id, s]));
  const list = rows.map((r) => {
    const s = by.get(r.id);
    // taken down (or past its end) wins over not started yet
    const status =
      r.ends_at && r.ends_at <= now ? 'ended' : r.starts_at > now ? 'scheduled' : 'live';
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category,
      priority: r.priority,
      tone: r.tone,
      audience: r.audience,
      plan: r.plan_filter,
      centreCategory: r.centre_category,
      banner: !!r.show_banner,
      push: !!r.push,
      pushStatus: r.push_status,
      pushAt: r.push_at?.toISOString() ?? null,
      pushSentAt: r.push_sent_at?.toISOString() ?? null,
      pushPhones: Number(r.push_phones),
      pushSent: Number(r.push_sent),
      audienceSize: r.audience_size === null ? null : Number(r.audience_size),
      link: r.link,
      ctaLabel: r.cta_label,
      screen: r.screen,
      startsAt: r.starts_at.toISOString(),
      endsAt: r.ends_at?.toISOString() ?? null,
      createdBy: r.created_by,
      createdAt: r.created_at.toISOString(),
      status,
      live: status === 'live',
      stats: {
        seen: Number(s?.seen ?? 0),
        clicked: Number(s?.clicked ?? 0),
        dismissed: Number(s?.dismissed ?? 0),
        opened: Number(s?.opened ?? 0),
      },
    };
  });
  const monthAgo = new Date(now.getTime() - 30 * DAY);
  const recentPush = list.filter(
    (a) => a.pushSentAt && Date.parse(a.pushSentAt) > monthAgo.getTime(),
  );
  const reach = list.filter((a) => a.audienceSize);
  return {
    announcements: list,
    summary: {
      live: list.filter((a) => a.status === 'live').length,
      scheduled: list.filter((a) => a.status === 'scheduled' || a.pushStatus === 'scheduled')
        .length,
      pushes30: recentPush.length,
      phones30: recentPush.reduce((t, a) => t + a.pushSent, 0),
      seenRate: reach.length
        ? Math.round(
            (reach.reduce((t, a) => t + Math.min(1, a.stats.seen / (a.audienceSize || 1)), 0) /
              reach.length) *
              100,
          )
        : null,
      lastPushAt:
        list
          .map((a) => a.pushSentAt)
          .filter(Boolean)
          .sort()
          .pop() ?? null,
    },
  };
}

// ---------- what a tutor or helper sees ----------

interface Viewer {
  userId: string;
  role: 'owner' | 'staff' | null;
  instituteId: string | null;
}

/** The viewer's own centre: plan state and kind, to match an announcement's targeting. */
async function viewerCentre(pool: Pool, v: Viewer, now: Date) {
  if (!v.instituteId) return { plan: 'none' as const, category: '' };
  const [[r]] = (await pool.query(
    `SELECT i.category, s.plan, s.status, s.expires_at FROM institutes i
       LEFT JOIN subscriptions s ON s.institute_id = i.id WHERE i.id = ?`,
    [v.instituteId],
  )) as unknown as [
    [
      | { category: string; plan: string | null; status: string | null; expires_at: Date | null }
      | undefined,
    ],
  ];
  if (!r) return { plan: 'none' as const, category: '' };
  const active = r.status === 'active' && !!r.expires_at && r.expires_at > now;
  return {
    plan: !active
      ? ('ended' as const)
      : r.plan === 'trial'
        ? ('trial' as const)
        : ('paid' as const),
    category: r.category,
  };
}

const matches = (r: Row, v: Viewer, c: { plan: string; category: string }) =>
  (r.audience === 'all' || (r.audience === 'owners' ? v.role === 'owner' : v.role === 'staff')) &&
  (r.plan_filter === 'any' || r.plan_filter === c.plan) &&
  (!r.centre_category || r.centre_category === c.category);

const forApp = (
  r: Row,
  e?: { seen_at: Date | null; dismissed_at: Date | null; opened_at: Date | null },
) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  tone: r.tone,
  link: r.link,
  category: r.category,
  priority: r.priority,
  ctaLabel: r.cta_label,
  screen: r.screen,
  startsAt: r.starts_at.toISOString(),
  read: !!(e?.seen_at || e?.opened_at),
  dismissed: !!e?.dismissed_at,
});

/** Banners live now for this person (newest first, at most 3), unless they dismissed them. */
export async function liveFor(pool: Pool, v: Viewer, now: Date) {
  const c = await viewerCentre(pool, v, now);
  const [rows] = (await pool.query(
    `SELECT a.*, e.seen_at, e.dismissed_at, e.opened_at FROM announcements a
       LEFT JOIN announcement_events e ON e.announcement_id = a.id AND e.user_id = ?
      WHERE a.show_banner = 1 AND a.starts_at <= ? AND (a.ends_at IS NULL OR a.ends_at > ?)
      ORDER BY FIELD(a.priority, 'critical', 'important', 'normal'), a.starts_at DESC LIMIT 20`,
    [v.userId, now, now],
  )) as unknown as [
    (Row & { seen_at: Date | null; dismissed_at: Date | null; opened_at: Date | null })[],
  ];
  return rows
    .filter((r) => matches(r, v, c) && !r.dismissed_at)
    .slice(0, 3)
    .map((r) => forApp(r, r));
}

/** The Updates inbox: everything sent to this person in the last 60 days, newest first, with what they have read. */
export async function inboxFor(pool: Pool, v: Viewer, now: Date) {
  const c = await viewerCentre(pool, v, now);
  const [rows] = (await pool.query(
    `SELECT a.*, e.seen_at, e.dismissed_at, e.opened_at FROM announcements a
       LEFT JOIN announcement_events e ON e.announcement_id = a.id AND e.user_id = ?
      WHERE a.starts_at <= ? AND a.starts_at > ? ORDER BY a.starts_at DESC LIMIT 100`,
    [v.userId, now, new Date(now.getTime() - 60 * DAY)],
  )) as unknown as [
    (Row & { seen_at: Date | null; dismissed_at: Date | null; opened_at: Date | null })[],
  ];
  const items = rows
    .filter((r) => matches(r, v, c))
    .slice(0, 50)
    .map((r) => forApp(r, r));
  return { updates: items, unread: items.filter((i) => !i.read).length };
}

export const eventInput = z.object({ type: z.enum(['seen', 'clicked', 'dismissed', 'opened']) });
const COL = {
  seen: 'seen_at',
  clicked: 'clicked_at',
  dismissed: 'dismissed_at',
  opened: 'opened_at',
} as const;

/** What a person did with an announcement; the first time of each counts. Opening or clicking also counts as seen. */
export async function recordEvent(
  pool: Pool,
  userId: string,
  id: string,
  type: z.infer<typeof eventInput>['type'],
  now: Date,
) {
  const [exists] = (await pool.query('SELECT 1 FROM announcements WHERE id = ?', [
    id,
  ])) as unknown as [unknown[]];
  if (!exists.length) throw notFound();
  const col = COL[type];
  const alsoSeen = type === 'clicked' || type === 'opened';
  await pool.query(
    `INSERT INTO announcement_events (announcement_id, user_id, ${col}${alsoSeen ? ', seen_at' : ''})
     VALUES (?, ?, ?${alsoSeen ? ', ?' : ''})
     ON DUPLICATE KEY UPDATE ${col} = COALESCE(${col}, VALUES(${col}))${alsoSeen ? ', seen_at = COALESCE(seen_at, VALUES(seen_at))' : ''}`,
    alsoSeen ? [id, userId, now, now] : [id, userId, now],
  );
}

/** Marks every update in the inbox as read. */
export async function markAllRead(pool: Pool, v: Viewer, now: Date) {
  const { updates } = await inboxFor(pool, v, now);
  for (const u of updates.filter((x) => !x.read))
    await recordEvent(pool, v.userId, u.id, 'seen', now);
  return { ok: true };
}
