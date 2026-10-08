import type { Pool } from '../db.js';
import { planState } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { getSettings } from './notify.js';
import type { MessageProvider } from './provider.js';
import { templateFor, type Lang, type MessageType, type TemplateMap } from './templates.js';

export interface WorkerDeps {
  pool: Pool;
  provider: MessageProvider | null; // null = not configured: queued messages are marked skipped
  templates: TemplateMap;
  clock?: () => Date;
}

export const MAX_ATTEMPTS = 3;
/** Minutes to wait after the 1st and 2nd failed attempt. */
const RETRY_MINUTES = [2, 15];
/** A message stuck in "sending" this long (the server stopped mid-send) goes back in the queue. */
const STALE_MINUTES = 10;
const E164 = /^\+[1-9]\d{9,14}$/;

export interface Tally {
  sent: number;
  retry: number;
  failed: number;
  skipped: number;
}

interface Row {
  id: string;
  institute_id: string;
  student_id: string;
  type: MessageType;
  lang: Lang;
  vars: string | null;
  attempts: number;
  parent_phone: string;
  student_status: string;
  notify_parent: number;
}

/**
 * Sends queued messages. Safe to run from several servers at once: each message is claimed with an atomic update,
 * so only one worker ever holds it. The student's CURRENT parent number is read at send time; the log keeps only
 * the last 4 digits. Failures retry twice (2 and 15 minutes later) and then stay `failed`.
 */
export async function processQueue(deps: WorkerDeps, limit = 25): Promise<Tally> {
  const { pool } = deps;
  const now = (deps.clock ?? (() => new Date()))();
  const tally: Tally = { sent: 0, retry: 0, failed: 0, skipped: 0 };

  await pool.query(
    "UPDATE messages SET status = 'queued', claim = NULL WHERE status = 'sending' AND claimed_at < ?",
    [new Date(now.getTime() - STALE_MINUTES * 60_000)],
  );

  const claim = newId();
  await pool.query(
    `UPDATE messages SET status = 'sending', claim = ?, claimed_at = ?, attempts = attempts + 1
      WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY next_attempt_at, id LIMIT ?`,
    [claim, now, now, limit],
  );
  const [rows] = (await pool.query(
    `SELECT m.id, m.institute_id, m.student_id, m.type, m.lang, m.vars, m.attempts, s.parent_phone, s.status AS student_status, s.notify_parent
       FROM messages m JOIN students s ON s.institute_id = m.institute_id AND s.id = m.student_id WHERE m.claim = ?`,
    [claim],
  )) as unknown as [Row[]];

  const settled = async (
    r: Row,
    status: 'sent' | 'failed' | 'skipped',
    extra: {
      reason?: string;
      error?: string;
      providerId?: string;
      channel?: string;
      templateId?: string;
    } = {},
  ) => {
    await pool.query(
      'UPDATE messages SET status = ?, reason = ?, error = ?, provider_id = ?, channel = ?, template_id = ?, sent_at = ?, vars = NULL, claim = NULL WHERE id = ?',
      [
        status,
        extra.reason ?? null,
        extra.error ?? null,
        extra.providerId ?? null,
        extra.channel ?? null,
        extra.templateId ?? null,
        status === 'sent' ? now : null,
        r.id,
      ],
    );
    tally[status === 'sent' ? 'sent' : status]++;
  };
  const planCache = new Map<string, { active: boolean; enabled: boolean }>();
  const institute = async (id: string) => {
    let v = planCache.get(id);
    if (!v) {
      v = {
        active: (await planState(pool, id, now)).active,
        enabled: (await getSettings(pool, id)).enabled,
      };
      planCache.set(id, v);
    }
    return v;
  };

  for (const r of rows) {
    const inst = await institute(r.institute_id);
    if (!inst.enabled) {
      await settled(r, 'skipped', { reason: 'switched-off' });
      continue;
    }
    if (!inst.active) {
      await settled(r, 'skipped', { reason: 'plan-expired' });
      continue;
    }
    if (r.student_status !== 'active' || !r.notify_parent) {
      await settled(r, 'skipped', { reason: 'opted-out' });
      continue;
    }
    if (!E164.test(r.parent_phone)) {
      await settled(r, 'skipped', { reason: 'bad-phone' });
      continue;
    }
    if (!deps.provider) {
      await settled(r, 'skipped', { reason: 'not-configured' });
      continue;
    }
    const templateId = templateFor(deps.templates, r.type, r.lang);
    if (!templateId) {
      await settled(r, 'skipped', { reason: 'no-template' });
      continue;
    }

    let vars: string[] = [];
    try {
      vars = JSON.parse(r.vars ?? '[]') as string[];
    } catch {
      /* a damaged row is sent with no values rather than blocking the queue */
    }
    const result = await deps.provider.send({
      to: r.parent_phone,
      templateId,
      vars,
      reference: r.id,
    });
    if (result.ok) {
      await settled(r, 'sent', {
        providerId: result.providerId,
        channel: deps.provider.name,
        templateId,
      });
      continue;
    }
    const error = (result.error ?? 'unknown').slice(0, 60);
    if (r.attempts >= MAX_ATTEMPTS) {
      await settled(r, 'failed', { error, channel: deps.provider.name, templateId });
      continue;
    }
    const wait = RETRY_MINUTES[Math.min(r.attempts, RETRY_MINUTES.length) - 1]!;
    await pool.query(
      "UPDATE messages SET status = 'queued', claim = NULL, error = ?, next_attempt_at = ? WHERE id = ?",
      [error, new Date(now.getTime() + wait * 60_000), r.id],
    );
    tally.retry++;
  }
  return tally;
}

/** Runs the worker on a timer, never two runs at once. Returns a function that stops it. */
export function startWorker(
  deps: WorkerDeps,
  onError: (e: unknown) => void,
  everyMs = 10_000,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    processQueue(deps)
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
