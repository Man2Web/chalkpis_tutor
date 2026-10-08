import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type Kind = 'logos' | 'photos';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;
export type Ext = keyof typeof TYPES;
export const contentTypeOf = (ext: Ext) => TYPES[ext];

/** Names we create look exactly like this; anything else never reaches the disk, so no path can escape the folder. */
const NAME = /^[a-f0-9]{32}\.(png|jpg|webp)$/;
export const isFileName = (n: unknown): n is string => typeof n === 'string' && NAME.test(n);
export const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1) as Ext;

/** What the bytes really are (from their first bytes), whatever the client claimed. Null when not PNG/JPEG/WebP. */
export function detectImage(b: Buffer): Ext | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  return null;
}

const dirOf = (root: string, kind: Kind) => path.join(root, kind);

/** Writes a new image under a random name (temp file then rename, so a reader never sees half a file). */
export async function saveImage(
  root: string,
  kind: Kind,
  bytes: Buffer,
  ext: Ext,
): Promise<string> {
  const dir = dirOf(root, kind);
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomBytes(16).toString('hex')}.${ext}`;
  const tmp = path.join(dir, `.${name}.tmp`);
  await fs.writeFile(tmp, bytes, { mode: 0o640 });
  await fs.rename(tmp, path.join(dir, name));
  return name;
}

export async function readImage(root: string, kind: Kind, name: string): Promise<Buffer | null> {
  if (!isFileName(name)) return null;
  try {
    return await fs.readFile(path.join(dirOf(root, kind), name));
  } catch {
    return null;
  }
}

/** Removes a stored image; a missing file or a bad name is fine. */
export async function removeImage(
  root: string,
  kind: Kind,
  name: string | null | undefined,
): Promise<void> {
  if (!name || !isFileName(name)) return;
  await fs.rm(path.join(dirOf(root, kind), name), { force: true });
}
