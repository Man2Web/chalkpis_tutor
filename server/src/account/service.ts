import { AppError } from '../errors.js';
import { withTransaction, type Pool } from '../db.js';
import { removeImage } from '../files/store.js';

/**
 * Deletes the caller's account.
 *  - Owner: the whole institute with everything in it (students, batches, attendance, fees, payments, messages,
 *    parent links, plan orders) goes in one transaction through the foreign keys; the owner's login goes too, and so
 *    do the stored pictures. Staff of that institute lose their access but keep their own logins.
 *  - Staff, or someone who never set up an institute: only their own login.
 * Plan payment records stay for accounting but are cut loose from the institute (their institute link becomes empty).
 */
export async function deleteAccount(
  pool: Pool,
  filesDir: string,
  userId: string,
): Promise<{ deletedInstitute: boolean }> {
  const files = { logos: [] as string[], photos: [] as string[] };
  let deletedInstitute = false;
  await withTransaction(pool, async (c) => {
    const [users] = (await c.query('SELECT phone FROM users WHERE id = ? FOR UPDATE', [
      userId,
    ])) as unknown as [{ phone: string }[]];
    if (!users[0]) throw new AppError(404, 'not_found');
    const [ms] = (await c.query('SELECT institute_id, role FROM memberships WHERE user_id = ?', [
      userId,
    ])) as unknown as [{ institute_id: string; role: string }[]];
    const m = ms[0];
    if (m?.role === 'owner') {
      await dropInstitute(c, m.institute_id, files);
      deletedInstitute = true;
    }
    await c.query('DELETE FROM otp_codes WHERE phone = ?', [users[0].phone]);
    await c.query('DELETE FROM users WHERE id = ?', [userId]);
  });
  await removeFiles(filesDir, files);
  return { deletedInstitute };
}

type Files = { logos: string[]; photos: string[] };
type Conn = Parameters<Parameters<typeof withTransaction>[1]>[0];

/** Deletes one institute and everything in it (through the foreign keys), noting its pictures for afterwards. */
async function dropInstitute(c: Conn, id: string, files: Files) {
  const [logo] = (await c.query('SELECT logo_path FROM institutes WHERE id = ?', [
    id,
  ])) as unknown as [{ logo_path: string | null }[]];
  if (logo[0]?.logo_path) files.logos.push(logo[0].logo_path);
  const [photos] = (await c.query(
    'SELECT photo_path FROM students WHERE institute_id = ? AND photo_path IS NOT NULL',
    [id],
  )) as unknown as [{ photo_path: string }[]];
  files.photos.push(...photos.map((p) => p.photo_path));
  await c.query('DELETE FROM institutes WHERE id = ?', [id]);
}

// Pictures are removed only after the database commit, so a failure never leaves a half-deleted account.
const removeFiles = (filesDir: string, files: Files) =>
  Promise.all([
    ...files.logos.map((n) => removeImage(filesDir, 'logos', n)),
    ...files.photos.map((n) => removeImage(filesDir, 'photos', n)),
  ]);

/**
 * The admin deletes a whole centre (a test or dummy one, decision 158): the institute with everything in it, and the
 * logins of its owner and helpers (a helper belongs to one centre only, so their login is no use without it).
 * Plan payment records stay for accounting, cut loose as with deleteAccount.
 */
export async function deleteCentre(pool: Pool, filesDir: string, instituteId: string) {
  const files: Files = { logos: [], photos: [] };
  const logins = await withTransaction(pool, async (c) => {
    const [inst] = (await c.query('SELECT owner_user_id FROM institutes WHERE id = ? FOR UPDATE', [
      instituteId,
    ])) as unknown as [{ owner_user_id: string }[]];
    if (!inst[0]) throw new AppError(404, 'not_found');
    const [people] = (await c.query(
      `SELECT u.id, u.phone FROM users u
        WHERE u.id = ? OR u.id IN (SELECT user_id FROM memberships WHERE institute_id = ?)`,
      [inst[0].owner_user_id, instituteId],
    )) as unknown as [{ id: string; phone: string | null }[]];
    await dropInstitute(c, instituteId, files);
    const phones = people.map((p) => p.phone).filter((p): p is string => !!p);
    if (phones.length) await c.query('DELETE FROM otp_codes WHERE phone IN (?)', [phones]);
    if (people.length)
      await c.query('DELETE FROM users WHERE id IN (?)', [people.map((p) => p.id)]);
    return people.length;
  });
  await removeFiles(filesDir, files);
  return { logins };
}
