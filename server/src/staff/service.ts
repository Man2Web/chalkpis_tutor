import { AppError, notFound } from '../errors.js';
import { inTransaction, type Pool, type PoolConnection } from '../db.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import type { AuthContext } from '../auth/guard.js';

type Db = Pool | PoolConnection;
export const MAX_STAFF = 10;

/**
 * Which batches the caller may work with: null = all (the owner), otherwise the assigned batch ids (staff).
 * Read from the database on every request, like the role itself.
 */
export async function batchScope(db: Db, auth: AuthContext): Promise<string[] | null> {
  if (auth.role !== 'staff') return null;
  const [rows] = (await db.query(
    'SELECT batch_id FROM staff_batches WHERE institute_id = ? AND user_id = ?',
    [auth.instituteId, auth.userId],
  )) as unknown as [{ batch_id: string }[]];
  return rows.map((r) => r.batch_id);
}

async function requireBatches(db: Db, instituteId: string, batchIds: string[]) {
  const unique = [...new Set(batchIds)];
  if (!unique.length) return unique;
  const [rows] = (await db.query(
    'SELECT COUNT(*) AS n FROM batches WHERE institute_id = ? AND id IN (?)',
    [instituteId, unique],
  )) as unknown as [{ n: number }[]];
  if (Number(rows[0]?.n) !== unique.length) throw new AppError(400, 'unknown_batch');
  return unique;
}

export async function listStaff(db: Db, instituteId: string) {
  const [rows] = (await db.query(
    `SELECT u.id, u.phone, u.name, m.created_at,
            (SELECT GROUP_CONCAT(sb.batch_id) FROM staff_batches sb WHERE sb.institute_id = m.institute_id AND sb.user_id = m.user_id) AS batch_ids
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.institute_id = ? AND m.role = 'staff' ORDER BY u.name, u.id`,
    [instituteId],
  )) as unknown as [
    { id: string; phone: string; name: string; created_at: Date; batch_ids: string | null }[],
  ];
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    addedAt: r.created_at.toISOString(),
    batchIds: r.batch_ids ? r.batch_ids.split(',') : [],
  }));
}

/**
 * Invites a helper by phone number. They sign in with the usual WhatsApp code and land straight in this institute.
 * A number that already belongs to any institute (this one included) is refused with the same answer, so this cannot
 * be used to find out who uses the app elsewhere.
 */
export async function addStaff(
  pool: Pool,
  instituteId: string,
  input: { phone: string; name: string; batchIds: string[] },
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  return withNamedLock(pool, `staff:${instituteId}`, (conn) =>
    inTransaction(conn, async (c) => {
      const batchIds = await requireBatches(c, instituteId, input.batchIds);
      const [count] = (await c.query(
        "SELECT COUNT(*) AS n FROM memberships WHERE institute_id = ? AND role = 'staff'",
        [instituteId],
      )) as unknown as [{ n: number }[]];
      if (Number(count[0]?.n) >= MAX_STAFF)
        throw new AppError(402, 'staff_limit', { limit: MAX_STAFF });
      const [users] = (await c.query('SELECT id FROM users WHERE phone = ? FOR UPDATE', [
        input.phone,
      ])) as unknown as [{ id: string }[]];
      let userId = users[0]?.id;
      if (userId) {
        const [m] = (await c.query('SELECT 1 FROM memberships WHERE user_id = ?', [
          userId,
        ])) as unknown as [unknown[]];
        if (m.length) throw new AppError(409, 'already_member');
      } else {
        userId = newId();
        await c.query('INSERT INTO users (id, phone, name) VALUES (?, ?, ?)', [
          userId,
          input.phone,
          input.name,
        ]);
      }
      await c.query(
        "INSERT INTO memberships (user_id, institute_id, role, onboarding_done) VALUES (?, ?, 'staff', 1)",
        [userId, instituteId],
      );
      if (batchIds.length)
        await c.query('INSERT INTO staff_batches (institute_id, user_id, batch_id) VALUES ?', [
          batchIds.map((b) => [instituteId, userId, b]),
        ]);
      return userId;
    }),
  );
}

async function requireStaffMember(db: Db, instituteId: string, userId: string) {
  const [rows] = (await db.query(
    "SELECT 1 FROM memberships WHERE institute_id = ? AND user_id = ? AND role = 'staff'",
    [instituteId, userId],
  )) as unknown as [unknown[]];
  if (!rows.length) throw notFound(); // someone else's helper (or an owner) looks exactly like a missing one
}

/** Replaces the helper's assigned batches. */
export async function setStaffBatches(
  pool: Pool,
  instituteId: string,
  userId: string,
  batchIds: string[],
  now: Date,
) {
  await requireActivePlan(pool, instituteId, now);
  await withNamedLock(pool, `staff:${instituteId}`, (conn) =>
    inTransaction(conn, async (c) => {
      await requireStaffMember(c, instituteId, userId);
      const ids = await requireBatches(c, instituteId, batchIds);
      await c.query('DELETE FROM staff_batches WHERE institute_id = ? AND user_id = ?', [
        instituteId,
        userId,
      ]);
      if (ids.length)
        await c.query('INSERT INTO staff_batches (institute_id, user_id, batch_id) VALUES ?', [
          ids.map((b) => [instituteId, userId, b]),
        ]);
    }),
  );
}

/** Ends the helper's access immediately (their login itself stays, so they can use the app elsewhere). Allowed on an expired plan. */
export async function removeStaff(pool: Pool, instituteId: string, userId: string) {
  await requireStaffMember(pool, instituteId, userId);
  await pool.query(
    "DELETE FROM memberships WHERE institute_id = ? AND user_id = ? AND role = 'staff'",
    [instituteId, userId],
  );
}
