import { z } from 'zod';
import type { Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import { queueCentreWelcome } from '../messaging/centreMessages.js';
import type { AdminActor } from './service.js';

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0);

// ---------- WhatsApp monitor ----------

export const messagesQuery = z.object({
  status: z.enum(['all', 'queued', 'sending', 'sent', 'failed', 'skipped']).default('all'),
  type: z.string().max(30).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** Every parent message on the platform (newest first) and a 7-day summary by type and status. */
export async function messagesMonitor(pool: Pool, q: z.infer<typeof messagesQuery>, now: Date) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.status !== 'all') {
    where.push('m.status = ?');
    args.push(q.status);
  }
  if (q.type) {
    where.push('m.type = ?');
    args.push(q.type);
  }
  const [rows] = (await pool.query(
    `SELECT m.id, m.type, m.status, m.reason, m.error, m.attempts, m.to_last4, m.manual, m.template_id, m.channel,
            m.created_at, m.sent_at, i.name AS institute, st.name AS student
       FROM messages m JOIN institutes i ON i.id = m.institute_id
       LEFT JOIN students st ON st.institute_id = m.institute_id AND st.id = m.student_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.created_at DESC LIMIT ?`,
    [...args, q.limit],
  )) as unknown as [
    {
      id: string;
      type: string;
      status: string;
      reason: string | null;
      error: string | null;
      attempts: number;
      to_last4: string;
      manual: number;
      template_id: string | null;
      channel: string | null;
      created_at: Date;
      sent_at: Date | null;
      institute: string;
      student: string | null;
    }[],
  ];
  const [summary] = (await pool.query(
    'SELECT type, status, COUNT(*) c FROM messages WHERE created_at >= ? GROUP BY type, status',
    [new Date(now.getTime() - 7 * DAY)],
  )) as unknown as [{ type: string; status: string; c: number }[]];
  const [errors] = (await pool.query(
    `SELECT COALESCE(error, reason, 'unknown') e, COUNT(*) c FROM messages
      WHERE status IN ('failed','skipped') AND created_at >= ? GROUP BY e ORDER BY c DESC LIMIT 10`,
    [new Date(now.getTime() - 7 * DAY)],
  )) as unknown as [{ e: string; c: number }[]];
  return {
    messages: rows.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      why: r.error ?? r.reason ?? '',
      attempts: n(r.attempts),
      to: `•••• ${r.to_last4}`,
      manual: !!r.manual,
      template: r.template_id ?? '',
      channel: r.channel ?? '',
      institute: r.institute,
      student: r.student ?? '',
      createdAt: r.created_at.toISOString(),
      sentAt: r.sent_at?.toISOString() ?? null,
    })),
    summary: summary.map((s) => ({ type: s.type, status: s.status, count: n(s.c) })),
    topErrors: errors.map((e) => ({ error: e.e, count: n(e.c) })),
  };
}

export const ownerMessagesQuery = z.object({
  status: z.enum(['all', 'queued', 'sending', 'sent', 'failed', 'skipped']).default('all'),
  type: z.string().max(30).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * Every message Chalkpis sends to a centre's own people (newest first): the owner's welcome, plan active, plan ending
 * and ended, and helper invites; a 7-day summary by type and status; and the centres made in the last 30 days whose
 * owner was never even queued a welcome (an owner without a mobile number, for example).
 */
export async function ownerMessages(pool: Pool, q: z.infer<typeof ownerMessagesQuery>, now: Date) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (q.status !== 'all') {
    where.push('m.status = ?');
    args.push(q.status);
  }
  if (q.type) {
    where.push('m.type = ?');
    args.push(q.type);
  }
  const [rows] = (await pool.query(
    `SELECT m.institute_id, m.type, m.ref, m.status, m.reason, m.error, m.attempts, m.to_last4, m.created_at,
            m.sent_at, i.name AS institute, u.name AS recipient, m.user_id = i.owner_user_id AS to_owner
       FROM centre_messages m JOIN institutes i ON i.id = m.institute_id
       LEFT JOIN users u ON u.id = m.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY m.created_at DESC LIMIT ?`,
    [...args, q.limit],
  )) as unknown as [
    {
      institute_id: string;
      type: string;
      ref: string;
      status: string;
      reason: string | null;
      error: string | null;
      attempts: number;
      to_last4: string;
      created_at: Date;
      sent_at: Date | null;
      institute: string;
      recipient: string | null;
      to_owner: number;
    }[],
  ];
  const since = new Date(now.getTime() - 7 * DAY);
  const [summary] = (await pool.query(
    'SELECT type, status, COUNT(*) c FROM centre_messages WHERE created_at >= ? GROUP BY type, status',
    [since],
  )) as unknown as [{ type: string; status: string; c: number }[]];
  const [errors] = (await pool.query(
    `SELECT COALESCE(error, reason, 'unknown') e, COUNT(*) c FROM centre_messages
      WHERE status IN ('failed','skipped') AND created_at >= ? GROUP BY e ORDER BY c DESC LIMIT 10`,
    [since],
  )) as unknown as [{ e: string; c: number }[]];
  const [missing] = (await pool.query(
    `SELECT i.id, i.name, i.created_at, u.name AS owner, u.phone IS NOT NULL AND u.phone <> '' AS has_phone
       FROM institutes i JOIN users u ON u.id = i.owner_user_id
      WHERE i.created_at >= ?
        AND NOT EXISTS (SELECT 1 FROM centre_messages m WHERE m.institute_id = i.id AND m.type = 'centre_welcome')
      ORDER BY i.created_at DESC LIMIT 50`,
    [new Date(now.getTime() - 30 * DAY)],
  )) as unknown as [
    { id: string; name: string; created_at: Date; owner: string | null; has_phone: number }[],
  ];
  return {
    messages: rows.map((r) => ({
      instituteId: r.institute_id,
      type: r.type,
      ref: r.ref,
      status: r.status,
      why: r.error ?? r.reason ?? '',
      attempts: n(r.attempts),
      to: `•••• ${r.to_last4}`,
      recipient: r.recipient ?? '',
      toOwner: !!n(r.to_owner),
      institute: r.institute,
      createdAt: r.created_at.toISOString(),
      sentAt: r.sent_at?.toISOString() ?? null,
    })),
    summary: summary.map((x) => ({ type: x.type, status: x.status, count: n(x.c) })),
    topErrors: errors.map((e) => ({ error: e.e, count: n(e.c) })),
    noWelcome: missing.map((m) => ({
      instituteId: m.id,
      name: m.name,
      owner: m.owner ?? '',
      createdAt: m.created_at.toISOString(),
      hasPhone: !!n(m.has_phone),
    })),
  };
}

/**
 * Sends a centre's welcome to its owner again (or for the first time, if it was never queued): the earlier one is
 * replaced by a fresh one with today's details, queued for the worker. Not while one is still on its way.
 */
export async function resendWelcome(pool: Pool, actor: AdminActor, instituteId: string, now: Date) {
  const [inst] = (await pool.query('SELECT id FROM institutes WHERE id = ?', [
    instituteId,
  ])) as unknown as [{ id: string }[]];
  if (!inst[0]) throw notFound();
  const [cur] = (await pool.query(
    "SELECT status FROM centre_messages WHERE institute_id = ? AND type = 'centre_welcome' AND ref = ''",
    [instituteId],
  )) as unknown as [{ status: string }[]];
  if (cur[0] && (cur[0].status === 'queued' || cur[0].status === 'sending'))
    throw new AppError(409, 'in_progress');
  await pool.query(
    "DELETE FROM centre_messages WHERE institute_id = ? AND type = 'centre_welcome' AND ref = ''",
    [instituteId],
  );
  if (!(await queueCentreWelcome(pool, instituteId, now))) throw new AppError(409, 'no_phone');
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, target_institute_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    [
      newId(),
      actor.userId,
      actor.phone,
      'resend-welcome',
      instituteId,
      cur[0] ? `was ${cur[0].status}` : 'never queued',
    ],
  );
  return { ok: true };
}

/**
 * Puts a failed message back in the queue for another try. Only possible while its values are still kept
 * (they are wiped once a message is final), so in practice: right after a failure caused by a setting that is
 * now fixed. Otherwise answers `cannot_retry`.
 */
export async function retryMessage(pool: Pool, actor: AdminActor, id: string, now: Date) {
  const [rows] = (await pool.query('SELECT status, vars, institute_id FROM messages WHERE id = ?', [
    id,
  ])) as unknown as [{ status: string; vars: string | null; institute_id: string }[]];
  const m = rows[0];
  if (!m) throw notFound();
  if (m.status !== 'failed') throw new AppError(409, 'not_failed');
  if (!m.vars) throw new AppError(409, 'cannot_retry');
  await pool.query(
    "UPDATE messages SET status = 'queued', attempts = 0, error = NULL, next_attempt_at = ?, claim = NULL WHERE id = ? AND status = 'failed'",
    [now, id],
  );
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, target_institute_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), actor.userId, actor.phone, 'retry-message', m.institute_id, id],
  );
}

// ---------- system health ----------

export async function systemHealth(
  pool: Pool,
  info: {
    version: string;
    startedAt: Date;
    provider: string;
    templates: string[];
    publicBaseUrl: string;
  },
  now: Date,
) {
  const t0 = Date.now();
  await pool.query('SELECT 1');
  const dbMs = Date.now() - t0;
  const [[q]] = (await pool.query(
    `SELECT SUM(status = 'queued') queued, SUM(status = 'sending') sending,
            SUM(status = 'failed' AND created_at >= ?) failed24h,
            MIN(CASE WHEN status = 'queued' THEN next_attempt_at END) oldest
       FROM messages`,
    [new Date(now.getTime() - DAY)],
  )) as unknown as [[{ queued: number; sending: number; failed24h: number; oldest: Date | null }]];
  const [jobs] = (await pool.query(
    'SELECT job, MAX(ran_at) last FROM job_runs GROUP BY job ORDER BY job',
  )) as unknown as [{ job: string; last: Date }[]];
  const [migs] = (await pool.query(
    'SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1',
  )) as unknown as [{ name: string }[]];
  const [[size]] = (await pool.query(
    'SELECT ROUND(SUM(data_length + index_length) / 1048576, 1) mb FROM information_schema.tables WHERE table_schema = DATABASE()',
  )) as unknown as [[{ mb: number }]];
  return {
    server: {
      version: info.version,
      node: process.version,
      uptimeSeconds: Math.round((now.getTime() - info.startedAt.getTime()) / 1000),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      publicBaseUrl: info.publicBaseUrl,
    },
    database: { ok: true, pingMs: dbMs, sizeMb: n(size!.mb), lastMigration: migs[0]?.name ?? '' },
    queue: {
      queued: n(q!.queued),
      sending: n(q!.sending),
      failed24h: n(q!.failed24h),
      oldestQueuedMinutes: q!.oldest
        ? Math.max(0, Math.round((now.getTime() - q!.oldest.getTime()) / 60000))
        : 0,
    },
    whatsapp: { provider: info.provider, templates: info.templates },
    jobs: jobs.map((j) => ({ job: j.job, lastRunAt: j.last.toISOString() })),
  };
}

// ---------- quick search and CSV ----------

/** ⌘K search: logins and centres by name or phone. */
export async function quickSearch(pool: Pool, q: string) {
  if (q.trim().length < 2) return { users: [], institutes: [] };
  const like = `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [users] = (await pool.query(
    'SELECT id, name, phone FROM users WHERE name LIKE ? OR phone LIKE ? ORDER BY last_login_at DESC LIMIT 8',
    [like, like],
  )) as unknown as [{ id: string; name: string; phone: string }[]];
  const [insts] = (await pool.query(
    'SELECT id, name FROM institutes WHERE name LIKE ? ORDER BY created_at DESC LIMIT 8',
    [like],
  )) as unknown as [{ id: string; name: string }[]];
  return { users, institutes: insts };
}

/** Spreadsheet-safe CSV (a leading = + - @ is neutralised so Excel never runs it as a formula). */
export function toCsv(rows: (string | number | boolean | null)[][]): string {
  const cell = (v: string | number | boolean | null) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}`;
}
