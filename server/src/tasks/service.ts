import { z } from 'zod';
import type { Pool } from '../db.js';
import { notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { isRealDate, todayYmd, ymdRe } from '../lib/ist.js';

const day = z.string().regex(ymdRe).refine(isRealDate);

export const taskInput = z.object({
  title: z.string().trim().min(1).max(200),
  dueOn: day.optional(),
});
export const taskPatch = z
  .object({ title: z.string().trim().min(1).max(200), done: z.boolean(), dueOn: day })
  .partial()
  .refine((p) => Object.keys(p).length > 0);
export const taskQuery = z.object({ date: day.optional() });

interface Row {
  id: string;
  title: string;
  due_on: Date | string;
  done: number;
}
const ymd = (v: Date | string) =>
  typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
const toTask = (r: Row) => ({ id: r.id, title: r.title, dueOn: ymd(r.due_on), done: !!r.done });

/** The day's list: everything due that day, plus anything older that is still not done (it carries over). */
export async function listTasks(pool: Pool, instituteId: string, date: string) {
  const [rows] = (await pool.query(
    `SELECT id, title, due_on, done FROM tasks
     WHERE institute_id = ? AND (due_on = ? OR (due_on < ? AND done = 0))
     ORDER BY done, due_on, created_at, id LIMIT 200`,
    [instituteId, date, date],
  )) as unknown as [Row[]];
  return rows.map(toTask);
}

export async function addTask(
  pool: Pool,
  instituteId: string,
  input: z.infer<typeof taskInput>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const id = newId();
  await pool.query('INSERT INTO tasks (id, institute_id, title, due_on) VALUES (?, ?, ?, ?)', [
    id,
    instituteId,
    input.title,
    input.dueOn ?? todayYmd(now),
  ]);
  return { id };
}

export async function updateTask(
  pool: Pool,
  instituteId: string,
  id: string,
  p: z.infer<typeof taskPatch>,
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  const map: Record<string, unknown> = {
    title: p.title,
    due_on: p.dueOn,
    done: p.done === undefined ? undefined : p.done ? 1 : 0,
    done_at: p.done === undefined ? undefined : p.done ? now : null,
  };
  const sets = Object.entries(map).filter(([, v]) => v !== undefined);
  const [r] = (await pool.query(
    `UPDATE tasks SET ${sets.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ? AND institute_id = ?`,
    [...sets.map(([, v]) => v), id, instituteId],
  )) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}

export async function deleteTask(pool: Pool, instituteId: string, id: string) {
  const [r] = (await pool.query('DELETE FROM tasks WHERE id = ? AND institute_id = ?', [
    id,
    instituteId,
  ])) as unknown as [{ affectedRows: number }];
  if (!r.affectedRows) throw notFound();
}
