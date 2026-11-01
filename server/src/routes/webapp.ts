import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

/** Where `npm run web:build` (repo root) exports the browser version of the app. */
export const WEB_APP_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'app',
);

// The app's own script, styles, fonts and pictures, and calls to this server only. React Native Web writes its styles
// into the page at run time, hence 'unsafe-inline' for styles (never for scripts). blob: and data: are pictures the app
// makes itself (QR codes, the poster before download, a chosen photo).
const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
// worth compressing: the script alone is about 4 MB, about 1 MB once compressed
const TEXT = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg']);

const br = promisify(brotliCompress);
const gz = promisify(gzip);

/**
 * The browser version of the tutor app (the same Expo app as the phones) at /app, same origin as the API, so it needs
 * no CORS. Built files under _expo/ and assets/ carry a content hash in their names and are cached for a year; the
 * page itself is never cached, so a deploy reaches everyone on their next visit. Any other path under /app without a
 * file extension gets the page too (the app has one address; a refreshed or bookmarked path still opens it).
 */
export function webAppRoutes(app: FastifyInstance, dir: string = WEB_APP_DIR) {
  const root = path.resolve(dir);
  // compressed copies, made once per file and encoding (the files only change with a deploy)
  const packed = new Map<string, Promise<Buffer>>();
  const pack = (file: string, enc: 'br' | 'gzip', body: Buffer) => {
    const key = `${enc}:${file}`;
    let p = packed.get(key);
    if (!p) {
      p =
        enc === 'br'
          ? br(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })
          : gz(body, { level: 9 });
      p.catch(() => packed.delete(key));
      packed.set(key, p);
    }
    return p;
  };

  const send = async (req: FastifyRequest, reply: FastifyReply, rel: string) => {
    const file = path.resolve(root, rel);
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext];
    // only files inside the app folder, of the kinds the build makes
    if (!type || !file.startsWith(root + path.sep)) return null;
    const body = await readFile(file).catch(() => null);
    if (!body) return null;
    const hashed = rel.startsWith('_expo/') || rel.startsWith('assets/');
    reply
      .header('Content-Security-Policy', CSP)
      .header('X-Robots-Tag', 'noindex')
      .header(
        'Cache-Control',
        ext === '.html'
          ? 'no-cache'
          : hashed
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=86400',
      )
      .type(type);
    if (!TEXT.has(ext)) return reply.send(body);
    reply.header('Vary', 'Accept-Encoding');
    const accepts = String(req.headers['accept-encoding'] ?? '');
    const enc = /\bbr\b/.test(accepts) ? 'br' : /\bgzip\b/.test(accepts) ? 'gzip' : null;
    if (!enc) return reply.send(body);
    return reply.header('Content-Encoding', enc).send(await pack(file, enc, body));
  };

  // a page load fetches about ten files at once; give them room beyond the API's per-minute limit
  const opts = { config: { rateLimit: { max: 1000, timeWindow: '1 minute' } } };
  const page = async (req: FastifyRequest, reply: FastifyReply) =>
    (await send(req, reply, 'index.html')) ?? reply.code(404).send({ error: 'not_found' });
  app.get('/app', opts, page);
  app.get<{ Params: { '*': string } }>('/app/*', opts, async (req, reply) => {
    const rel = req.params['*'];
    if (rel === '' || path.extname(rel) === '') return page(req, reply);
    return (await send(req, reply, rel)) ?? reply.code(404).send({ error: 'not_found' });
  });
}
