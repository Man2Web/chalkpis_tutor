import { AppError } from '../errors.js';
import type { Pool, PoolConnection } from '../db.js';

type Db = Pool | PoolConnection;

export interface PlanState {
  active: boolean;
  studentLimit: number | null; // null = unlimited
  batchLimit: number | null;
}

export async function planState(db: Db, instituteId: string, now: Date): Promise<PlanState> {
  const [rows] = (await db.query(
    'SELECT status, expires_at, student_limit, batch_limit FROM subscriptions WHERE institute_id = ?',
    [instituteId],
  )) as unknown as [
    {
      status: string;
      expires_at: Date;
      student_limit: number | null;
      batch_limit: number | null;
    }[],
  ];
  const s = rows[0];
  if (!s) return { active: false, studentLimit: null, batchLimit: null };
  return {
    active: s.status === 'active' && s.expires_at.getTime() > now.getTime(),
    studentLimit: s.student_limit,
    batchLimit: s.batch_limit,
  };
}

/** Writes are refused (402) once the plan has ended; reading stays open. */
export async function requireActivePlan(
  db: Db,
  instituteId: string,
  now: Date,
): Promise<PlanState> {
  const p = await planState(db, instituteId, now);
  if (!p.active) throw new AppError(402, 'plan_expired');
  return p;
}

export async function activeCount(
  db: Db,
  table: 'students' | 'batches',
  instituteId: string,
): Promise<number> {
  const [rows] = (await db.query(
    `SELECT COUNT(*) AS n FROM ${table} WHERE institute_id = ? AND status = 'active'`,
    [instituteId],
  )) as unknown as [{ n: number }[]];
  return Number(rows[0]?.n ?? 0);
}

/** Throws 402 plan_limit when adding `adding` more active items would exceed the plan. */
export async function checkLimit(
  db: Db,
  kind: 'student' | 'batch',
  instituteId: string,
  plan: PlanState,
  adding = 1,
): Promise<void> {
  const limit = kind === 'student' ? plan.studentLimit : plan.batchLimit;
  if (limit === null) return;
  const used = await activeCount(db, kind === 'student' ? 'students' : 'batches', instituteId);
  if (used + adding > limit)
    throw new AppError(402, 'plan_limit', { kind, limit, room: Math.max(0, limit - used) });
}
