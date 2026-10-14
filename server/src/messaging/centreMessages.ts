import type { Pool, PoolConnection } from '../db.js';
import { payUrl } from '../billing/payLink.js';
import { pushToUsers, type PushSender } from '../push/expo.js';
import { PLANS, type PlanId } from '../billing/plans.js';
import { newId } from '../lib/ids.js';
import type { MessageProvider } from './provider.js';
import {
  CENTRE_IMAGE_TYPES,
  cleanVar,
  templateFor,
  type CentreMessageType,
  type TemplateMap,
} from './templates.js';

type Db = Pool | PoolConnection;

const MAX_ATTEMPTS = 3;
/** Minutes to wait after the 1st and 2nd failed attempt. */
const RETRY_MINUTES = [2, 15];
/** A message stuck in "sending" this long (the server stopped mid-send) goes back in the queue. */
const STALE_MINUTES = 10;
const E164 = /^\+[1-9]\d{9,14}$/;
/**
 * How many days before a free trial (and a paid plan) ends its owner is reminded, with the pay link. A trial is
 * reminded once more on its last day.
 */
export const PLAN_REMINDER_DAYS = { trial: 3, paid: 3 } as const;
/**
 * An ended plan is reminded about only if it ended this recently, so the reminder starts with the next plan to end
 * instead of waking up every centre whose plan ended long ago.
 */
const ENDED_WITHIN_DAYS = 2;
/** The banner sent as the image header of plan reminders. */
export const PLAN_IMAGE_PATH = '/plan-renew.png';

const day = (d: Date) =>
  d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

interface Centre {
  name: string;
  owner_id: string;
  owner_name: string;
  expires_at: Date | null;
}

async function centre(db: Db, instituteId: string): Promise<Centre | null> {
  const [rows] = (await db.query(
    `SELECT i.name, i.owner_user_id AS owner_id, u.name AS owner_name, s.expires_at
       FROM institutes i JOIN users u ON u.id = i.owner_user_id
       LEFT JOIN subscriptions s ON s.institute_id = i.id
      WHERE i.id = ?`,
    [instituteId],
  )) as unknown as [Centre[]];
  return rows[0] ?? null;
}

const ownerName = (c: Centre) => cleanVar(c.owner_name.trim() || 'there');

/**
 * Queues one message from Chalkpis to a person at a centre. The same (centre, type, ref) never queues twice, so a
 * retried request or a job run twice sends nothing new. Someone without a mobile number is simply not told.
 */
async function queueCentre(
  db: Db,
  m: { instituteId: string; type: CentreMessageType; ref: string; userId: string; vars: string[] },
  now: Date,
): Promise<boolean> {
  const [[user]] = (await db.query('SELECT phone FROM users WHERE id = ?', [
    m.userId,
  ])) as unknown as [[{ phone: string | null } | undefined]];
  if (!user?.phone) return false;
  const [r] = (await db.query(
    `INSERT IGNORE INTO centre_messages (institute_id, type, ref, user_id, to_last4, vars, status, next_attempt_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [
      m.instituteId,
      m.type,
      m.ref.slice(0, 64),
      m.userId,
      user.phone.slice(-4),
      JSON.stringify(m.vars),
      now,
      now,
    ],
  )) as unknown as [{ affectedRows: number }];
  return r.affectedRows === 1;
}

/** A new centre: "Hi Kiran, your Chalkpis account for Kiran Karate Academy is ready. Your free trial runs until …". */
export async function queueCentreWelcome(db: Db, instituteId: string, now: Date) {
  const c = await centre(db, instituteId);
  if (!c) return false;
  return queueCentre(
    db,
    {
      instituteId,
      type: 'centre_welcome',
      ref: '',
      userId: c.owner_id,
      vars: [
        ownerName(c),
        cleanVar(c.name),
        c.expires_at ? day(c.expires_at) : 'the end of your trial',
      ],
    },
    now,
  );
}

/** A plan was paid for: "The Standard plan for Kiran Karate Academy is now active until …". Once per payment. */
export async function queuePlanActive(
  db: Db,
  instituteId: string,
  p: { paymentId: string; planId: PlanId; expiresAt: Date },
  now: Date,
) {
  const c = await centre(db, instituteId);
  if (!c) return false;
  return queueCentre(
    db,
    {
      instituteId,
      type: 'plan_active',
      ref: p.paymentId,
      userId: c.owner_id,
      vars: [
        ownerName(c),
        cleanVar(`${PLANS[p.planId].name} plan for ${c.name}`, 90),
        day(p.expiresAt),
      ],
    },
    now,
  );
}

/** A helper was added: "Kiran has added you as a helper at Kiran Karate Academy on Chalkpis…". Once per helper. */
export async function queueHelperInvite(
  db: Db,
  instituteId: string,
  helper: { userId: string; name: string },
  now: Date,
) {
  const c = await centre(db, instituteId);
  if (!c) return false;
  return queueCentre(
    db,
    {
      instituteId,
      type: 'helper_invite',
      ref: helper.userId,
      userId: helper.userId,
      vars: [cleanVar(helper.name.trim() || 'there'), ownerName(c), cleanVar(c.name)],
    },
    now,
  );
}

/**
 * Daily: the owner of every centre whose free trial ends within PLAN_REMINDER_DAYS.trial days (a paid plan: .paid days)
 * gets "the … ends on …" with the centre's pay link, and on the day it ended (if it was not renewed), "the … ended on
 * …". The end date is the ref, so each end date is reminded about once, and a renewed plan is reminded again when its
 * new end comes. Needs the public address to build the link. With `templates` given, a reminder whose template is not
 * set yet is not queued at all (rather than queued and skipped for good): it goes out on the first daily run after the
 * template is added, while the plan is still within the window. Returns how many were queued.
 */
export async function queuePlanReminders(
  pool: Pool,
  now: Date,
  links: { baseUrl: string; secret: string; templates?: TemplateMap; push?: PushSender | null },
): Promise<number> {
  const DAY = 86_400_000;
  const [rows] = (await pool.query(
    // a store subscription that renews by itself is not "ending" (it is reminded about if the owner cancels it)
    `SELECT institute_id, plan, expires_at FROM subscriptions
      WHERE ((expires_at > ? AND expires_at <= IF(plan = 'trial', ?, ?))
         OR (expires_at <= ? AND expires_at > ?))
        AND NOT (store IS NOT NULL AND store_will_renew = 1)`,
    [
      now,
      new Date(now.getTime() + PLAN_REMINDER_DAYS.trial * DAY),
      new Date(now.getTime() + PLAN_REMINDER_DAYS.paid * DAY),
      now,
      new Date(now.getTime() - ENDED_WITHIN_DAYS * DAY),
    ],
  )) as unknown as [{ institute_id: string; plan: string; expires_at: Date }[]];
  let n = 0;
  for (const r of rows) {
    const c = await centre(pool, r.institute_id);
    if (!c) continue;
    const type = r.expires_at.getTime() <= now.getTime() ? 'plan_ended' : 'plan_ending';
    // a trial's last day gets its own reminder (the first one came about three days before)
    const last =
      r.plan === 'trial' && type === 'plan_ending' && r.expires_at.getTime() - now.getTime() <= DAY;
    const ref = `${r.expires_at.toISOString().slice(0, 10)}${last ? '-last' : ''}`;
    // the same news in the app (it opens Plans & billing, where owners subscribe in the store). Sent whether or not the
    // WhatsApp one can go (an owner without a phone, a template not set yet); push_log keeps it to once per end date.
    const label =
      r.plan === 'trial' ? 'free trial' : `${PLANS[r.plan as PlanId]?.name ?? 'Chalkpis'} plan`;
    await pushToUsers(
      pool,
      links.push ?? null,
      [c.owner_id],
      `plan_${type}_${r.institute_id}_${ref}`,
      {
        title:
          type === 'plan_ended'
            ? `Your ${label} has ended`
            : `${last ? 'Last reminder: your' : 'Your'} ${label} ends on ${day(r.expires_at)}`,
        body:
          type === 'plan_ended'
            ? 'Your data is safe. Choose a plan in Plans & billing to keep adding students, attendance and fees.'
            : 'Choose a plan in Plans & billing to keep everything running. Plans start at ₹5 a day.',
        screen: 'Billing',
      },
    );
    if (links.templates && !templateFor(links.templates, type)) continue;
    const what =
      r.plan === 'trial'
        ? `free trial for ${c.name}`
        : `${PLANS[r.plan as PlanId]?.name ?? 'Chalkpis'} plan for ${c.name}`;
    const queued = await queueCentre(
      pool,
      {
        instituteId: r.institute_id,
        type,
        ref,
        userId: c.owner_id,
        vars: [
          ownerName(c),
          cleanVar(what, 90),
          day(r.expires_at),
          cleanVar(payUrl(links.baseUrl, links.secret, r.institute_id), 120),
        ],
      },
      now,
    );
    if (queued) n++;
  }
  return n;
}

export interface CentreQueueDeps {
  pool: Pool;
  provider: MessageProvider | null;
  templates: TemplateMap;
  /** The server's public address, for the header image of plan reminders. */
  publicBaseUrl?: string;
  clock?: () => Date;
}

interface Row {
  institute_id: string;
  type: CentreMessageType;
  ref: string;
  vars: string | null;
  attempts: number;
  phone: string | null;
}

/**
 * Sends queued centre messages, like the parent-message worker: each row is claimed with an atomic update, the
 * person's CURRENT number is read at send time, and failures retry twice (2 and 15 minutes later).
 */
export async function processCentreQueue(deps: CentreQueueDeps, limit = 25) {
  const { pool } = deps;
  const now = (deps.clock ?? (() => new Date()))();
  const tally = { sent: 0, retry: 0, failed: 0, skipped: 0 };
  await pool.query(
    "UPDATE centre_messages SET status = 'queued', claim = NULL WHERE status = 'sending' AND claimed_at < ?",
    [new Date(now.getTime() - STALE_MINUTES * 60_000)],
  );
  const claim = newId();
  await pool.query(
    `UPDATE centre_messages SET status = 'sending', claim = ?, claimed_at = ?, attempts = attempts + 1
      WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?`,
    [claim, now, now, limit],
  );
  const [rows] = (await pool.query(
    `SELECT m.institute_id, m.type, m.ref, m.vars, m.attempts, u.phone
       FROM centre_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.claim = ?`,
    [claim],
  )) as unknown as [Row[]];

  const where = 'WHERE institute_id = ? AND type = ? AND ref = ?';
  const settle = async (
    r: Row,
    status: 'sent' | 'failed' | 'skipped',
    extra: { reason?: string; error?: string; providerId?: string } = {},
  ) => {
    await pool.query(
      `UPDATE centre_messages SET status = ?, reason = ?, error = ?, provider_id = ?, sent_at = ?, vars = NULL, claim = NULL ${where}`,
      [
        status,
        extra.reason ?? null,
        extra.error ?? null,
        extra.providerId ?? null,
        status === 'sent' ? now : null,
        r.institute_id,
        r.type,
        r.ref,
      ],
    );
    tally[status]++;
  };

  for (const r of rows) {
    if (!r.phone || !E164.test(r.phone)) {
      await settle(r, 'skipped', { reason: 'bad-phone' });
      continue;
    }
    if (!deps.provider) {
      await settle(r, 'skipped', { reason: 'not-configured' });
      continue;
    }
    const templateId = templateFor(deps.templates, r.type);
    if (!templateId) {
      await settle(r, 'skipped', { reason: 'no-template' });
      continue;
    }
    let vars: string[] = [];
    try {
      vars = JSON.parse(r.vars ?? '[]') as string[];
    } catch {
      /* a damaged row is sent with no values rather than blocking the queue */
    }
    const imageUrl =
      CENTRE_IMAGE_TYPES.has(r.type) && deps.publicBaseUrl
        ? `${deps.publicBaseUrl.replace(/\/$/, '')}${PLAN_IMAGE_PATH}`
        : undefined;
    const result = await deps.provider.send({
      to: r.phone,
      templateId,
      vars,
      reference: `cm_${newId()}`,
      ...(imageUrl ? { imageUrl } : {}),
    });
    if (result.ok) {
      await settle(r, 'sent', { providerId: result.providerId });
      continue;
    }
    const error = (result.error ?? 'unknown').slice(0, 80);
    if (r.attempts >= MAX_ATTEMPTS) {
      await settle(r, 'failed', { error });
      continue;
    }
    const wait = RETRY_MINUTES[Math.min(r.attempts, RETRY_MINUTES.length) - 1]!;
    await pool.query(
      `UPDATE centre_messages SET status = 'queued', claim = NULL, error = ?, next_attempt_at = ? ${where}`,
      [error, new Date(now.getTime() + wait * 60_000), r.institute_id, r.type, r.ref],
    );
    tally.retry++;
  }
  return tally;
}
