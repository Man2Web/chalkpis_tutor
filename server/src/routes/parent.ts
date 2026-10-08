import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import {
  DEFAULT_LINK_DAYS,
  MAX_LINK_DAYS,
  buildParentView,
  createParentLink,
  parentLinkStatus,
  revokeParentLinks,
} from '../parent/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const linkBody = z.object({
  days: z.number().int().min(1).max(MAX_LINK_DAYS).default(DEFAULT_LINK_DAYS),
});
const viewBody = z.object({ token: z.string().max(100) });

/** The parent page may load only its own script and style, talk only to this server, and show https pictures. */
const PAGE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function pageHeaders(reply: FastifyReply, noStore: boolean) {
  reply
    .header('Content-Security-Policy', PAGE_CSP)
    .header('Referrer-Policy', 'no-referrer')
    .header('X-Robots-Tag', 'noindex, nofollow')
    .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    .header('Cache-Control', noStore ? 'no-store' : 'public, max-age=300');
}

export function parentRoutes(app: FastifyInstance, deps: Deps) {
  const { pool, config } = deps;
  const read = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const sid = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  // ---- the tutor's side ----
  app.post('/students/:id/parent-link', write, async (req, reply) => {
    const { days } = parse(linkBody, req.body ?? {});
    const l = await createParentLink(
      pool,
      { instituteId: inst(req), studentId: sid(req), createdBy: req.auth!.userId, days },
      now(),
    );
    return reply.code(201).send({
      token: l.token,
      url: `${config.PUBLIC_BASE_URL ?? ''}/p/${l.token}`,
      expiresAt: l.expiresAt.toISOString(),
    });
  });
  app.delete('/students/:id/parent-link', write, async (req) => ({
    revoked: await revokeParentLinks(pool, inst(req), sid(req)),
  }));
  app.get('/students/:id/parent-link', read, async (req) =>
    parentLinkStatus(pool, inst(req), sid(req), now()),
  );

  // ---- the parent's side: no sign-in, the secret link is the key ----
  // Every failure (bad format, unknown, expired, switched off) is the same 404, so a link cannot be probed.
  app.post(
    '/api/parent',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
      const body = viewBody.safeParse(req.body);
      const view = body.success
        ? await buildParentView(pool, body.data.token, now(), config.PUBLIC_BASE_URL)
        : null;
      if (!view) return reply.code(404).send({ error: 'not_found' });
      return view;
    },
  );

  const asset =
    (file: string, type: string, noStore = false) =>
    async (_req: unknown, reply: FastifyReply) => {
      pageHeaders(reply, noStore);
      return reply.type(type).send(await readFile(path.join(PUBLIC_DIR, file)));
    };
  app.get('/p/:token', async (req, reply) => {
    pageHeaders(reply, true);
    return reply
      .type('text/html; charset=utf-8')
      .send(await readFile(path.join(PUBLIC_DIR, 'parent.html')));
  });
  app.get('/parent.js', asset('parent.js', 'text/javascript; charset=utf-8'));
  app.get('/parent.css', asset('parent.css', 'text/css; charset=utf-8'));
  app.get('/', asset('index.html', 'text/html; charset=utf-8'));
}
