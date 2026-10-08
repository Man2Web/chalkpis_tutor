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
      const id = m.institute_id;
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
      deletedInstitute = true;
    }
    await c.query('DELETE FROM otp_codes WHERE phone = ?', [users[0].phone]);
    await c.query('DELETE FROM users WHERE id = ?', [userId]);
  });
  // Pictures are removed only after the database commit, so a failure never leaves a half-deleted account.
  await Promise.all([
    ...files.logos.map((n) => removeImage(filesDir, 'logos', n)),
    ...files.photos.map((n) => removeImage(filesDir, 'photos', n)),
  ]);
  return { deletedInstitute };
}
