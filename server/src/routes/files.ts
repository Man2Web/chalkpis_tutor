import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { requireActivePlan } from '../institutes/limits.js';
import { AppError, notFound } from '../errors.js';
import {
  MAX_IMAGE_BYTES,
  contentTypeOf,
  detectImage,
  extOf,
  isFileName,
  readImage,
  removeImage,
  saveImage,
} from '../files/store.js';
import { idParam } from '../lib/params.js';
import { batchScope } from '../staff/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

/** Public address of an institute's logo, for the parent page and the app. Null when there is none. */
export const logoUrl = (base: string | undefined, name: string | null) =>
  name ? `${base ?? ''}/files/logos/${name}` : null;

export function fileRoutes(app: FastifyInstance, deps: Deps) {
  const { pool, config } = deps;
  const root = config.FILES_DIR;
  const read = { preHandler: [authenticate(deps), requireInstitute] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const limit = {
    rateLimit: {
      max: Math.max(20, Math.floor(config.RATE_LIMIT_PER_MIN / 15)),
      timeWindow: '1 minute',
    },
  };
  const upload = { ...write, bodyLimit: MAX_IMAGE_BYTES, config: limit };

  // Uploads are the raw image bytes (no multipart): the app sends the picture as the request body.
  void app.register(async (up) => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp'])
      up.addContentTypeParser(t, { parseAs: 'buffer' }, (_r, body, done) => done(null, body));

    const checked = (body: unknown) => {
      if (!Buffer.isBuffer(body)) throw new AppError(415, 'unsupported_image');
      const ext = detectImage(body); // trust the bytes, not the header the client sent
      if (!ext) throw new AppError(415, 'unsupported_image');
      return { body, ext };
    };

    up.put('/institute/logo', upload, async (req) => {
      await requireActivePlan(pool, inst(req), now());
      const { body, ext } = checked(req.body);
      const [rows] = (await pool.query('SELECT logo_path FROM institutes WHERE id = ?', [
        inst(req),
      ])) as unknown as [{ logo_path: string | null }[]];
      const name = await saveImage(root, 'logos', body, ext);
      await pool.query('UPDATE institutes SET logo_path = ? WHERE id = ?', [name, inst(req)]);
      await removeImage(root, 'logos', rows[0]?.logo_path);
      return { logoUrl: logoUrl(config.PUBLIC_BASE_URL, name) };
    });

    up.put('/students/:id/photo', upload, async (req) => {
      const id = idParam((req.params as { id: string }).id);
      await requireActivePlan(pool, inst(req), now());
      const [rows] = (await pool.query(
        'SELECT photo_path FROM students WHERE institute_id = ? AND id = ?',
        [inst(req), id],
      )) as unknown as [{ photo_path: string | null }[]];
      if (!rows[0]) throw notFound();
      const { body, ext } = checked(req.body);
      const name = await saveImage(root, 'photos', body, ext);
      await pool.query('UPDATE students SET photo_path = ? WHERE institute_id = ? AND id = ?', [
        name,
        inst(req),
        id,
      ]);
      await removeImage(root, 'photos', rows[0].photo_path);
      return { photoUrl: `/students/${id}/photo` };
    });
  });

  app.delete('/institute/logo', write, async (req) => {
    await requireActivePlan(pool, inst(req), now());
    const [rows] = (await pool.query('SELECT logo_path FROM institutes WHERE id = ?', [
      inst(req),
    ])) as unknown as [{ logo_path: string | null }[]];
    await pool.query('UPDATE institutes SET logo_path = NULL WHERE id = ?', [inst(req)]);
    await removeImage(root, 'logos', rows[0]?.logo_path);
    return { ok: true };
  });

  app.delete('/students/:id/photo', write, async (req) => {
    const id = idParam((req.params as { id: string }).id);
    await requireActivePlan(pool, inst(req), now());
    const [rows] = (await pool.query(
      'SELECT photo_path FROM students WHERE institute_id = ? AND id = ?',
      [inst(req), id],
    )) as unknown as [{ photo_path: string | null }[]];
    if (!rows[0]) throw notFound();
    await pool.query('UPDATE students SET photo_path = NULL WHERE institute_id = ? AND id = ?', [
      inst(req),
      id,
    ]);
    await removeImage(root, 'photos', rows[0].photo_path);
    return { ok: true };
  });

  // A student's photo is private: only a member of that student's institute can fetch it.
  app.get('/students/:id/photo', read, async (req, reply) => {
    const id = idParam((req.params as { id: string }).id);
    const scope = await batchScope(pool, req.auth!);
    if (scope) {
      const [m] = (await pool.query(
        'SELECT 1 FROM student_batches WHERE institute_id = ? AND student_id = ? AND batch_id IN (?) LIMIT 1',
        [inst(req), id, scope.length ? scope : ['']],
      )) as unknown as [unknown[]];
      if (!m.length) throw notFound();
    }
    const [rows] = (await pool.query(
      'SELECT photo_path FROM students WHERE institute_id = ? AND id = ?',
      [inst(req), id],
    )) as unknown as [{ photo_path: string | null }[]];
    const name = rows[0]?.photo_path;
    const bytes = name ? await readImage(root, 'photos', name) : null;
    if (!name || !bytes) throw notFound();
    return reply
      .header('Content-Type', contentTypeOf(extOf(name)))
      .header('Cache-Control', 'private, max-age=300')
      .send(bytes);
  });

  // Logos are public on purpose (the parent page shows them). The name is random, so it cannot be guessed.
  app.get('/files/logos/:name', async (req, reply) => {
    const name = (req.params as { name: string }).name;
    const bytes = isFileName(name) ? await readImage(root, 'logos', name) : null;
    if (!bytes) throw notFound();
    return reply
      .header('Content-Type', contentTypeOf(extOf(name)))
      .header('Cache-Control', 'public, max-age=86400')
      .header('Cross-Origin-Resource-Policy', 'cross-origin')
      .send(bytes);
  });
}
