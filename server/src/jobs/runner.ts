import type { Pool } from '../db.js';
import { generateDues } from '../fees/service.js';
import { expireDueSubscriptions } from '../billing/service.js';
import { currentPeriod, istHour, todayYmd } from '../lib/ist.js';
import { enqueueAllFeeReminders } from '../messaging/notify.js';

export interface JobLog {
  info: (o: object, msg: string) => void;
  error: (o: object, msg: string) => void;
}

interface Job {
  name: string;
  /** Earliest Indian hour of the day it may run. */
  from: number;
  /** It is skipped if the server only comes back after this hour (a 9 am reminder must not go out at 10 pm). */
  until: number;
  /** How often: once a day, or once an hour. */
  every: 'day' | 'hour';
  run: (pool: Pool, now: Date) => Promise<number>;
}

async function dueInstitutes(pool: Pool, now: Date): Promise<string[]> {
  const [rows] = (await pool.query(
    "SELECT institute_id FROM subscriptions WHERE status = 'active' AND expires_at > ?",
    [now],
  )) as unknown as [{ institute_id: string }[]];
  return rows.map((r) => r.institute_id);
}

/** Every night: this month's missing dues for every institute with a live plan (a student who joined later gets theirs). */
async function duesJob(pool: Pool, now: Date) {
  let n = 0;
  for (const id of await dueInstitutes(pool, now))
    n += await generateDues(pool, id, currentPeriod(now));
  return n;
}

/** Old, finished rows nobody needs: used login codes, dead sessions, long-expired links, old message log lines. */
async function cleanupJob(pool: Pool, now: Date) {
  const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
  let n = 0;
  const run = async (sql: string, args: unknown[]) => {
    const [res] = (await pool.query(sql, args)) as unknown as [{ affectedRows: number }];
    n += res.affectedRows;
  };
  await run('DELETE FROM otp_codes WHERE expires_at < ?', [ago(1)]);
  await run(
    'DELETE FROM refresh_tokens WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)',
    [ago(7), ago(7)],
  );
  await run('DELETE FROM parent_links WHERE expires_at < ?', [ago(30)]);
  await run("DELETE FROM messages WHERE status IN ('sent','failed','skipped') AND created_at < ?", [
    ago(180),
  ]);
  await run('DELETE FROM job_runs WHERE ran_at < ?', [ago(60)]);
  return n;
}

export const JOBS: Job[] = [
  { name: 'dues', from: 2, until: 23, every: 'day', run: duesJob },
  {
    name: 'expire',
    from: 0,
    until: 23,
    every: 'hour',
    run: (pool, now) => expireDueSubscriptions(pool, now),
  },
  { name: 'cleanup', from: 4, until: 23, every: 'day', run: cleanupJob },
  {
    name: 'reminders',
    from: 9,
    until: 18,
    every: 'day',
    run: (pool, now) => enqueueAllFeeReminders(pool, now),
  },
];

/**
 * One pass of the scheduler: runs every job that is due and has not run yet for its day (or hour). Safe on several
 * servers at once and across restarts, because each run is claimed in `job_runs` first. A job that fails gives its
 * claim back so the next pass tries again. Returns the names of the jobs that ran.
 */
export async function runDueJobs(
  pool: Pool,
  now: Date,
  log: JobLog,
  jobs: Job[] = JOBS,
): Promise<string[]> {
  const hour = istHour(now);
  const day = todayYmd(now);
  const ran: string[] = [];
  for (const job of jobs) {
    if (hour < job.from || hour > job.until) continue;
    const key = job.every === 'day' ? day : `${day}T${String(hour).padStart(2, '0')}`;
    const [res] = (await pool.query('INSERT IGNORE INTO job_runs (job, run_key) VALUES (?, ?)', [
      job.name,
      key,
    ])) as unknown as [{ affectedRows: number }];
    if (res.affectedRows !== 1) continue; // someone already ran it
    try {
      const count = await job.run(pool, now);
      ran.push(job.name);
      log.info({ job: job.name, count }, 'job done');
    } catch (e) {
      await pool.query('DELETE FROM job_runs WHERE job = ? AND run_key = ?', [job.name, key]);
      log.error(
        { job: job.name, err: { name: (e as Error).name, code: (e as { code?: string }).code } },
        'job failed',
      );
    }
  }
  return ran;
}

/** Checks once a minute. Returns a function that stops it. */
export function startScheduler(
  pool: Pool,
  log: JobLog,
  clock: () => Date = () => new Date(),
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runDueJobs(pool, clock(), log)
      .catch((e) => log.error({ err: { name: (e as Error).name } }, 'scheduler failed'))
      .finally(() => {
        running = false;
      });
  }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
