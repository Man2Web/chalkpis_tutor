import type { Pool, PoolConnection } from '../db.js';
import { PLANS, type PlanId } from '../billing/plans.js';
import { newId } from '../lib/ids.js';
import type { MessageProvider } from './provider.js';
import { cleanVar, templateFor, type CentreMessageType, type TemplateMap } from './templates.js';

type Db = Pool | PoolConnection;

const MAX_ATTEMPTS = 3;
/** Minutes to wait after the 1st and 2nd failed attempt. */
const RETRY_MINUTES = [2, 15];
/** A message stuck in "sending" this long (the server stopped mid-send) goes back in the queue. */
const STALE_MINUTES = 10;
const E164 = /^\+[1-9]\d{9,14}$/;
/** How long before a free trial ends its owner is reminded. */
export const TRIAL_REMINDER_DAYS = 2;

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
 * Daily: every free trial ending within the next TRIAL_REMINDER_DAYS gets one reminder to its owner (the trial's end
 * date is the ref, so a trial that is extended and ends again later is reminded again). Returns how many were queued.
 */
export async function queueTrialEndings(pool: Pool, now: Date): Promise<number> {
  const [rows] = (await pool.query(
    `SELECT institute_id, expires_at FROM subscriptions
      WHERE plan = 'trial' AND status = 'active' AND expires_at > ? AND expires_at <= ?`,
    [now, new Date(now.getTime() + TRIAL_REMINDER_DAYS * 86_400_000)],
  )) as unknown as [{ institute_id: string; expires_at: Date }[]];
  let n = 0;
  for (const r of rows) {
    const c = await centre(pool, r.institute_id);
    if (!c) continue;
    const queued = await queueCentre(
      pool,
      {
        instituteId: r.institute_id,
        type: 'trial_ending',
        ref: r.expires_at.toISOString().slice(0, 10),
        userId: c.owner_id,
        vars: [ownerName(c), cleanVar(c.name), day(r.expires_at)],
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
    const result = await deps.provider.send({
      to: r.phone,
      templateId,
      vars,
      reference: `cm_${newId()}`,
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
