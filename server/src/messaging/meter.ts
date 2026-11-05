import type { Pool } from '../db.js';
import { todayYmd } from '../lib/ist.js';

/**
 * Counts one WhatsApp message the gateway accepted, for the spend on the admin dashboard (decision 159): per Indian
 * day, centre and kind. A failure here never stops or repeats a send, so it is only logged by the caller's catch.
 */
export async function meterSend(
  pool: Pool,
  now: Date,
  kind: string,
  instituteId: string | null,
): Promise<void> {
  await pool
    .query(
      `INSERT INTO wa_usage (day, institute_id, kind, sent) VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE sent = sent + 1`,
      [todayYmd(now), instituteId ?? '', kind.slice(0, 30)],
    )
    .catch(() => undefined);
}

/** A login code: counted against the centre of whoever owns that number, if any. */
export async function meterLoginCode(pool: Pool, now: Date, phone: string): Promise<void> {
  await pool
    .query(
      `INSERT INTO wa_usage (day, institute_id, kind, sent)
       VALUES (?, COALESCE((SELECT m.institute_id FROM users u JOIN memberships m ON m.user_id = u.id
                             WHERE u.phone = ? LIMIT 1), ''), 'login_code', 1)
       ON DUPLICATE KEY UPDATE sent = sent + 1`,
      [todayYmd(now), phone],
    )
    .catch(() => undefined);
}
