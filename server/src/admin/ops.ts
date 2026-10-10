import { z } from 'zod';
import type { Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
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

// ---------- announcements ----------

export const announcementBody = z.object({
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().max(400).default(''),
  tone: z.enum(['info', 'success', 'warning']).default('info'),
  audience: z.enum(['all', 'owners', 'staff']).default('all'),
  link: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || /^https:\/\/[^\s<>"]+$/i.test(v))
    .default(''),
  days: z.number().int().min(1).max(365).nullable().default(7),
});

interface AnnRow {
  id: string;
  title: string;
  body: string;
  tone: string;
  audience: string;
  link: string;
  starts_at: Date;
  ends_at: Date | null;
  created_by: string;
}
const toAnn = (r: AnnRow, now: Date) => ({
  id: r.id,
  title: r.title,
  body: r.body,
  tone: r.tone,
  audience: r.audience,
  link: r.link,
  startsAt: r.starts_at.toISOString(),
  endsAt: r.ends_at?.toISOString() ?? null,
  createdBy: r.created_by,
  live: r.starts_at <= now && (!r.ends_at || r.ends_at > now),
});

export async function listAnnouncements(pool: Pool, now: Date) {
  const [rows] = (await pool.query(
    'SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100',
  )) as unknown as [AnnRow[]];
  return rows.map((r) => toAnn(r, now));
}

export async function createAnnouncement(
  pool: Pool,
  actor: AdminActor,
  b: z.infer<typeof announcementBody>,
  now: Date,
) {
  const id = newId();
  await pool.query(
    'INSERT INTO announcements (id, title, body, tone, audience, link, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      b.title,
      b.body,
      b.tone,
      b.audience,
      b.link,
      now,
      b.days ? new Date(now.getTime() + b.days * DAY) : null,
      actor.phone,
    ],
  );
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, detail) VALUES (?, ?, ?, ?, ?)',
    [newId(), actor.userId, actor.phone, 'announce', b.title],
  );
  return { id };
}

/** Takes an announcement down now (it stays in the list as ended). */
export async function endAnnouncement(pool: Pool, actor: AdminActor, id: string, now: Date) {
  const [r] = (await pool.query('UPDATE announcements SET ends_at = ? WHERE id = ?', [
    now,
    id,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
  await pool.query(
    'INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, detail) VALUES (?, ?, ?, ?, ?)',
    [newId(), actor.userId, actor.phone, 'end-announcement', id],
  );
}

/** What a signed-in tutor or helper sees: live announcements for their role, newest first. */
export async function liveAnnouncements(pool: Pool, role: 'owner' | 'staff' | null, now: Date) {
  const [rows] = (await pool.query(
    `SELECT * FROM announcements WHERE starts_at <= ? AND (ends_at IS NULL OR ends_at > ?)
       AND (audience = 'all' OR audience = ?) ORDER BY starts_at DESC LIMIT 3`,
    [now, now, role === 'staff' ? 'staff' : 'owners'],
  )) as unknown as [AnnRow[]];
  return rows.map((r) => {
    const a = toAnn(r, now);
    return { id: a.id, title: a.title, body: a.body, tone: a.tone, link: a.link };
  });
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
