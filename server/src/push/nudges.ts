import type { Pool } from '../db.js';
import { todayYmd, weekdayOf } from '../lib/ist.js';
import { pushToUsers, type PushSender } from './expo.js';

const hhmm = (d: Date) =>
  d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });

/**
 * Evening job (hourly, 8 to 10 pm): for each centre with an active plan, the batches scheduled today that have ended
 * and are still not marked (no attendance, holiday or cancellation saved). Each batch is nudged about once a day, so a
 * later run only tells about batches that ended since (a 7 to 8:30 pm batch is caught at 9). The owner, and helpers of
 * those batches, get one notification per centre per run. Returns how many centres were nudged.
 */
export async function attendanceNudges(
  pool: Pool,
  push: PushSender | null,
  now: Date,
): Promise<number> {
  if (!push) return 0;
  const day = todayYmd(now);
  const weekday = weekdayOf(day);
  const [rows] = (await pool.query(
    `SELECT b.institute_id, b.id, b.name, i.owner_user_id
       FROM batches b
       JOIN institutes i ON i.id = b.institute_id
       JOIN subscriptions s ON s.institute_id = b.institute_id AND s.status = 'active' AND s.expires_at > ?
      WHERE b.status = 'active' AND FIND_IN_SET(?, b.days) > 0 AND b.end_time <= ?
        AND NOT EXISTS (SELECT 1 FROM attendance_days a WHERE a.institute_id = b.institute_id AND a.batch_id = b.id AND a.day = ?)
      ORDER BY b.institute_id, b.start_time`,
    [now, weekday, hhmm(now), day],
  )) as unknown as [{ institute_id: string; id: string; name: string; owner_user_id: string }[]];
  const byCentre = new Map<string, typeof rows>();
  for (const r of rows) byCentre.set(r.institute_id, [...(byCentre.get(r.institute_id) ?? []), r]);
  let n = 0;
  for (const [instituteId, all] of byCentre) {
    const batches: typeof rows = [];
    for (const b of all) {
      const [r] = (await pool.query('INSERT IGNORE INTO push_log (push_key) VALUES (?)', [
        `att_${b.id}_${day}`,
      ])) as unknown as [{ affectedRows: number }];
      if (r.affectedRows === 1) batches.push(b);
    }
    if (!batches.length) continue;
    const [staff] = (await pool.query(
      `SELECT DISTINCT user_id FROM staff_batches WHERE institute_id = ? AND batch_id IN (${batches.map(() => '?').join(',')})`,
      [instituteId, ...batches.map((b) => b.id)],
    )) as unknown as [{ user_id: string }[]];
    const names = batches.map((b) => b.name);
    const sent = await pushToUsers(
      pool,
      push,
      [batches[0]!.owner_user_id, ...staff.map((s) => s.user_id)],
      `att_${instituteId}_${day}_${hhmm(now).slice(0, 2)}`,
      {
        title: names.length === 1 ? 'Attendance not marked' : `${names.length} batches not marked`,
        body:
          names.length === 1
            ? `${names[0]} has not been marked today. It takes a few seconds.`
            : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ' and more' : ''} are not marked today.`,
        screen: 'Attendance',
      },
    );
    if (sent) n++;
  }
  return n;
}
