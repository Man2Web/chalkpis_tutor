import { z } from 'zod';
import { inTransaction, type Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { todayYmd } from '../lib/ist.js';

/** More than this in one family is almost certainly a mistake (a shared number linked by accident). */
export const MAX_FAMILY = 10;
export const linkInput = z.object({ studentId: z.string().uuid() });

/**
 * Puts two students in one family (decision 155). Either may already have brothers or sisters: they all end up in the
 * same family, so linking Ravi to Asha also links him to Asha's sister.
 */
export async function linkSiblings(
  pool: Pool,
  instituteId: string,
  aId: string,
  bId: string,
  now: Date,
) {
  if (aId === bId) throw new AppError(400, 'same_student');
  await requireActivePlan(pool, instituteId, now);
  const conn = await pool.getConnection();
  try {
    return await inTransaction(conn, async (c) => {
      const [rows] = (await c.query(
        'SELECT id, family_id FROM students WHERE institute_id = ? AND id IN (?) FOR UPDATE',
        [instituteId, [aId, bId]],
      )) as unknown as [{ id: string; family_id: string | null }[]];
      const a = rows.find((r) => r.id === aId);
      const b = rows.find((r) => r.id === bId);
      if (!a || !b) throw notFound();
      const family = a.family_id ?? b.family_id ?? newId();
      const families = [...new Set([a.family_id, b.family_id].filter(Boolean))] as string[];
      const [[size]] = (await c.query(
        'SELECT COUNT(*) AS n FROM students WHERE institute_id = ? AND (id IN (?) OR family_id IN (?))',
        [instituteId, [aId, bId], families.length ? families : ['']],
      )) as unknown as [[{ n: number }]];
      if (Number(size.n) > MAX_FAMILY) throw new AppError(400, 'family_too_big');
      if (families.length)
        await c.query(
          'UPDATE students SET family_id = ? WHERE institute_id = ? AND family_id IN (?)',
          [family, instituteId, families],
        );
      await c.query('UPDATE students SET family_id = ? WHERE institute_id = ? AND id IN (?)', [
        family,
        instituteId,
        [aId, bId],
      ]);
      return { familyId: family };
    });
  } finally {
    conn.release();
  }
}

/** Takes one student out of their family. A family of one is no family, so the last one left is freed too. */
export async function unlinkSibling(pool: Pool, instituteId: string, id: string, now: Date) {
  await requireActivePlan(pool, instituteId, now);
  const conn = await pool.getConnection();
  try {
    await inTransaction(conn, async (c) => {
      const [[me]] = (await c.query(
        'SELECT family_id FROM students WHERE institute_id = ? AND id = ? FOR UPDATE',
        [instituteId, id],
      )) as unknown as [[{ family_id: string | null } | undefined]];
      if (!me) throw notFound();
      if (!me.family_id) return;
      await c.query('UPDATE students SET family_id = NULL WHERE institute_id = ? AND id = ?', [
        instituteId,
        id,
      ]);
      const [left] = (await c.query(
        'SELECT id FROM students WHERE institute_id = ? AND family_id = ?',
        [instituteId, me.family_id],
      )) as unknown as [{ id: string }[]];
      if (left.length === 1)
        await c.query('UPDATE students SET family_id = NULL WHERE institute_id = ? AND id = ?', [
          instituteId,
          left[0]!.id,
        ]);
    });
  } finally {
    conn.release();
  }
}

/**
 * A student's family with what each child owes now (unpaid and part-paid dues, as on the Fees screen), and the
 * family's total. Empty when the student has no linked brothers or sisters.
 */
export async function familyOf(pool: Pool, instituteId: string, id: string, now: Date) {
  const [[me]] = (await pool.query(
    'SELECT family_id FROM students WHERE institute_id = ? AND id = ?',
    [instituteId, id],
  )) as unknown as [[{ family_id: string | null } | undefined]];
  if (!me) throw notFound();
  if (!me.family_id) return { familyId: null, members: [], outstanding: 0, overdue: 0 };
  const owed =
    'GREATEST(CAST(d.amount AS SIGNED) - CAST(d.discount AS SIGNED) - CAST(d.paid AS SIGNED), 0)';
  const [rows] = (await pool.query(
    `SELECT s.id, s.name, s.class, s.status, s.photo_path,
            COALESCE(SUM(${owed}), 0) AS owed,
            COALESCE(SUM(IF(d.due_date < ?, ${owed}, 0)), 0) AS overdue
       FROM students s
       LEFT JOIN fee_dues d ON d.institute_id = s.institute_id AND d.student_id = s.id AND d.status IN ('pending','partial')
      WHERE s.institute_id = ? AND s.family_id = ?
      GROUP BY s.id, s.name, s.class, s.status, s.photo_path
      ORDER BY s.name, s.id`,
    [todayYmd(now), instituteId, me.family_id],
  )) as unknown as [
    {
      id: string;
      name: string;
      class: string;
      status: 'active' | 'inactive';
      photo_path: string | null;
      owed: number;
      overdue: number;
    }[],
  ];
  const members = rows.map((r) => ({
    id: r.id,
    name: r.name,
    class: r.class,
    status: r.status,
    photoUrl: r.photo_path ? `/students/${r.id}/photo` : null,
    outstanding: Number(r.owed),
    overdue: Number(r.overdue),
  }));
  return {
    familyId: me.family_id,
    members,
    outstanding: members.reduce((t, m) => t + m.outstanding, 0),
    overdue: members.reduce((t, m) => t + m.overdue, 0),
  };
}

/**
 * The children one parent link may switch between: the link's own child and their active brothers and sisters, in
 * name order. Just the link's child when there is no family.
 */
export async function familyForParent(pool: Pool, instituteId: string, studentId: string) {
  const [rows] = (await pool.query(
    `SELECT s.id, s.name, s.class FROM students s
      WHERE s.institute_id = ? AND (s.id = ? OR (s.status = 'active' AND s.family_id IS NOT NULL AND s.family_id =
        (SELECT me.family_id FROM students me WHERE me.institute_id = ? AND me.id = ?)))
      ORDER BY s.name, s.id`,
    [instituteId, studentId, instituteId, studentId],
  )) as unknown as [{ id: string; name: string; class: string }[]];
  return rows;
}
