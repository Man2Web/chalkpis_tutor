import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool } from '../db.js';
import { isFileName, type Kind } from './store.js';

const DAY = 86_400_000;
/** A temp file left by a write that failed halfway (saveImage writes `.<name>.tmp`, then renames it). */
const TMP = /^\.[a-f0-9]{32}\.(png|jpg|webp)\.tmp$/;

const IN_USE: Record<Kind, string> = {
  logos: 'SELECT logo_path AS p FROM institutes WHERE logo_path IS NOT NULL',
  photos: 'SELECT photo_path AS p FROM students WHERE photo_path IS NOT NULL',
};

/**
 * Deletes stored pictures nothing points to any more, and half-written temp files (decided 9 Nov 2026, security
 * audit): a photo replaced while the old one was being removed, or an upload that raced an account deletion, would
 * otherwise stay on the shared disk for ever. Only files older than a day are touched, so an upload that has been
 * written but not yet saved on its student or centre is never taken. Returns how many files went.
 */
export async function removeOrphanImages(pool: Pool, root: string, now: Date): Promise<number> {
  const cutoff = now.getTime() - DAY;
  let removed = 0;
  for (const kind of Object.keys(IN_USE) as Kind[]) {
    const dir = path.join(root, kind);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue; // nothing stored of this kind yet
    }
    // read after listing: a picture saved in between is in the list only if its file came first, and is then a day old
    const [rows] = (await pool.query(IN_USE[kind])) as unknown as [{ p: string }[]];
    const used = new Set(rows.map((r) => r.p));
    for (const name of names) {
      const orphan = isFileName(name) && !used.has(name);
      if (!orphan && !TMP.test(name)) continue;
      const file = path.join(dir, name);
      const st = await fs.lstat(file).catch(() => null);
      if (!st?.isFile() || st.mtimeMs > cutoff) continue;
      await fs.rm(file, { force: true });
      removed++;
    }
  }
  return removed;
}
