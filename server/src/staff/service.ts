import { AppError, notFound } from '../errors.js';
import { inTransaction, type Pool, type PoolConnection } from '../db.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import type { AuthContext } from '../auth/guard.js';
import { queueHelperInvite } from '../messaging/centreMessages.js';

type Db = Pool | PoolConnection;
export const MAX_STAFF = 10;
/** New helper invites (WhatsApp from Chalkpis's number) one centre may send in 24 hours. */
export const MAX_INVITES_PER_DAY = 10;

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

/**
 * The centre's helpers: those who joined ('active') and those invited who have not accepted yet ('invited'). Both are
 * addressed by the person's user id, so changing batches or removing works the same for either.
 */
export async function listStaff(db: Db, instituteId: string) {
  const [rows] = (await db.query(
    `SELECT u.id, u.phone, u.name, m.created_at, 'active' AS status,
            (SELECT GROUP_CONCAT(sb.batch_id) FROM staff_batches sb WHERE sb.institute_id = m.institute_id AND sb.user_id = m.user_id) AS batch_ids
       FROM memberships m JOIN users u ON u.id = m.user_id
      WHERE m.institute_id = ? AND m.role = 'staff'
     UNION ALL
     SELECT u.id, u.phone, si.name, si.created_at, 'invited' AS status, si.batch_ids
       FROM staff_invites si JOIN users u ON u.id = si.user_id
      WHERE si.institute_id = ?
      ORDER BY name, id`,
    [instituteId, instituteId],
  )) as unknown as [
    {
      id: string;
      phone: string;
      name: string;
      created_at: Date;
      status: 'active' | 'invited';
      batch_ids: string | null;
    }[],
  ];
  return rows.map((r) => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    addedAt: r.created_at.toISOString(),
    status: r.status,
    batchIds: r.batch_ids ? r.batch_ids.split(',') : [],
  }));
}

/** Helpers who joined plus invites not answered yet: together they may not pass MAX_STAFF. */
async function staffCount(db: Db, instituteId: string) {
  const [[r]] = (await db.query(
    `SELECT (SELECT COUNT(*) FROM memberships WHERE institute_id = ? AND role = 'staff')
          + (SELECT COUNT(*) FROM staff_invites WHERE institute_id = ?) AS n`,
    [instituteId, instituteId],
  )) as unknown as [[{ n: number | string }]];
  return Number(r?.n ?? 0);
}

/**
 * Invites a helper by phone number (decided 9 Nov 2026, security audit): nothing is joined yet. The person gets the
 * WhatsApp invite, signs in with the usual code and accepts or declines in the app (acceptInvite). The answer is the
 * same whether or not the number uses the app in another centre, so this cannot be used to find out who does; only
 * a number already in, or already invited to, this centre is refused (that is the owner's own information).
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
      if ((await staffCount(c, instituteId)) >= MAX_STAFF)
        throw new AppError(402, 'staff_limit', { limit: MAX_STAFF });
      // Each new helper gets a WhatsApp invite from Chalkpis's own number, outside the parent-message daily cap, so
      // adding and removing helpers must not become a way to message any number in bulk.
      const [invites] = (await c.query(
        "SELECT COUNT(*) AS n FROM centre_messages WHERE institute_id = ? AND type = 'helper_invite' AND created_at > ?",
        [instituteId, new Date(now.getTime() - 86_400_000)],
      )) as unknown as [{ n: number }[]];
      if (Number(invites[0]?.n) >= MAX_INVITES_PER_DAY)
        throw new AppError(429, 'too_many_invites', { limit: MAX_INVITES_PER_DAY });
      const [users] = (await c.query('SELECT id FROM users WHERE phone = ? FOR UPDATE', [
        input.phone,
      ])) as unknown as [{ id: string }[]];
      let userId = users[0]?.id;
      if (userId) {
        // only this centre's own people are refused; another centre's are invited like anyone else
        const [here] = (await c.query(
          `SELECT 1 FROM memberships WHERE user_id = ? AND institute_id = ?
           UNION ALL SELECT 1 FROM staff_invites WHERE user_id = ? AND institute_id = ?`,
          [userId, instituteId, userId, instituteId],
        )) as unknown as [unknown[]];
        if (here.length) throw new AppError(409, 'already_member');
      } else {
        // a bare login (number and name only), so the WhatsApp invite can be addressed; it joins nothing
        userId = newId();
        await c.query('INSERT INTO users (id, phone, name) VALUES (?, ?, ?)', [
          userId,
          input.phone,
          input.name,
        ]);
      }
      await c.query(
        'INSERT INTO staff_invites (institute_id, user_id, name, batch_ids, created_at) VALUES (?, ?, ?, ?, ?)',
        [instituteId, userId, input.name, batchIds.length ? batchIds.join(',') : null, now],
      );
      await queueHelperInvite(c, instituteId, { userId, name: input.name }, now);
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
      const ids = await requireBatches(c, instituteId, batchIds);
      // an invite not accepted yet: its batches are what the helper gets on joining
      const [inv] = (await c.query(
        'UPDATE staff_invites SET batch_ids = ? WHERE institute_id = ? AND user_id = ?',
        [ids.length ? ids.join(',') : null, instituteId, userId],
      )) as unknown as [{ affectedRows: number }];
      if (inv.affectedRows) return;
      await requireStaffMember(c, instituteId, userId);
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

/**
 * Ends the helper's access immediately (their login itself stays, so they can use the app elsewhere), or cancels an
 * invite not accepted yet. Allowed on an expired plan.
 */
export async function removeStaff(pool: Pool, instituteId: string, userId: string) {
  const [inv] = (await pool.query(
    'DELETE FROM staff_invites WHERE institute_id = ? AND user_id = ?',
    [instituteId, userId],
  )) as unknown as [{ affectedRows: number }];
  if (inv.affectedRows) return;
  await requireStaffMember(pool, instituteId, userId);
  await pool.query(
    "DELETE FROM memberships WHERE institute_id = ? AND user_id = ? AND role = 'staff'",
    [instituteId, userId],
  );
}

/** The invites waiting for this person (shown in the app when they belong to no centre yet). */
export async function invitesFor(db: Db, userId: string) {
  const [rows] = (await db.query(
    `SELECT si.institute_id, i.name AS centre, o.name AS owner, si.created_at
       FROM staff_invites si JOIN institutes i ON i.id = si.institute_id JOIN users o ON o.id = i.owner_user_id
      WHERE si.user_id = ? ORDER BY si.created_at DESC`,
    [userId],
  )) as unknown as [{ institute_id: string; centre: string; owner: string; created_at: Date }[]];
  return rows.map((r) => ({
    instituteId: r.institute_id,
    centreName: r.centre,
    ownerName: r.owner,
    invitedAt: r.created_at.toISOString(),
  }));
}

/**
 * The invited person says yes: they join the centre as a helper with the batches the owner chose (those that still
 * exist). Someone who already belongs to a centre (their own, or as a helper) must leave it first.
 */
export async function acceptInvite(pool: Pool, userId: string, instituteId: string, now: Date) {
  return withNamedLock(pool, `staff:${instituteId}`, (conn) =>
    inTransaction(conn, async (c) => {
      const [inv] = (await c.query(
        'SELECT batch_ids FROM staff_invites WHERE institute_id = ? AND user_id = ? FOR UPDATE',
        [instituteId, userId],
      )) as unknown as [{ batch_ids: string | null }[]];
      if (!inv[0]) throw notFound();
      const [mine] = (await c.query('SELECT 1 FROM memberships WHERE user_id = ?', [
        userId,
      ])) as unknown as [unknown[]];
      if (mine.length) throw new AppError(409, 'has_centre');
      await requireActivePlan(c, instituteId, now);
      const [[joined]] = (await c.query(
        "SELECT COUNT(*) AS n FROM memberships WHERE institute_id = ? AND role = 'staff'",
        [instituteId],
      )) as unknown as [[{ n: number | string }]];
      if (Number(joined?.n ?? 0) >= MAX_STAFF)
        throw new AppError(402, 'staff_limit', { limit: MAX_STAFF });
      await c.query(
        "INSERT INTO memberships (user_id, institute_id, role, onboarding_done) VALUES (?, ?, 'staff', 1)",
        [userId, instituteId],
      );
      const wanted = inv[0].batch_ids ? inv[0].batch_ids.split(',') : [];
      if (wanted.length) {
        const [still] = (await c.query(
          'SELECT id FROM batches WHERE institute_id = ? AND id IN (?)',
          [instituteId, wanted],
        )) as unknown as [{ id: string }[]];
        if (still.length)
          await c.query('INSERT INTO staff_batches (institute_id, user_id, batch_id) VALUES ?', [
            still.map((b) => [instituteId, userId, b.id]),
          ]);
      }
      await c.query('DELETE FROM staff_invites WHERE institute_id = ? AND user_id = ?', [
        instituteId,
        userId,
      ]);
    }),
  );
}

/** The invited person says no (or it was already gone): the invite is dropped. */
export async function declineInvite(pool: Pool, userId: string, instituteId: string) {
  await pool.query('DELETE FROM staff_invites WHERE institute_id = ? AND user_id = ?', [
    instituteId,
    userId,
  ]);
}

/** A helper leaves the centre they help at (their login stays). An owner cannot leave their own centre. */
export async function leaveCentre(pool: Pool, userId: string) {
  const [rows] = (await pool.query('SELECT role FROM memberships WHERE user_id = ?', [
    userId,
  ])) as unknown as [{ role: string }[]];
  if (!rows[0]) throw notFound();
  if (rows[0].role !== 'staff') throw new AppError(400, 'owner_cannot_leave');
  await pool.query("DELETE FROM memberships WHERE user_id = ? AND role = 'staff'", [userId]);
}
