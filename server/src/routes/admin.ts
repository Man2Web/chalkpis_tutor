import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app.js';
import {
  auditLog,
  blockBody,
  blockUser,
  getUser,
  listUsers,
  overview,
  planBody,
  recentLogins,
  setPlan,
  signOutUser,
  unblockUser,
  userListQuery,
} from '../admin/service.js';
import { analytics, getInstitute, listInstitutes } from '../admin/analytics.js';
import {
  announcementBody,
  createAnnouncement,
  endAnnouncement,
  listAnnouncements,
  liveAnnouncements,
  messagesMonitor,
  messagesQuery,
  quickSearch,
  retryMessage,
  systemHealth,
  toCsv,
} from '../admin/ops.js';
import { authenticate, requireAdmin } from '../auth/guard.js';
import { parseTemplates } from '../messaging/templates.js';
import { idParam, parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  clock?: () => Date;
  /** Which WhatsApp sender is in use, for the health screen. */
  providerName?: string;
};

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const STARTED_AT = new Date();
const VERSION = (() => {
  try {
    return (
      JSON.parse(readFileSync(path.join(PUBLIC_DIR, '..', 'package.json'), 'utf8')) as {
        version: string;
      }
    ).version;
  } catch {
    return '';
  }
})();

const ADMIN_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * The platform owner's dashboard. The page itself is public (it is only a sign-in screen and a script); every
 * /admin/api call needs a signed-in user whose number is in ADMIN_PHONES.
 */
export function adminRoutes(app: FastifyInstance, deps: Deps) {
  const { pool, config } = deps;
  const guard = {
    preHandler: [authenticate(deps), requireAdmin(config)],
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
  };
  const now = () => (deps.clock ?? (() => new Date()))();
  const actor = (req: FastifyRequest) => ({ userId: req.auth!.userId, phone: req.auth!.phone });
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);
  const admins = () => config.ADMIN_PHONES;

  app.get('/admin/api/overview', guard, async () => overview(pool, now()));
  app.get('/admin/api/users', guard, async (req) => ({
    users: await listUsers(pool, parse(userListQuery, req.query), admins(), now()),
  }));
  app.get('/admin/api/users/:id', guard, async (req) => getUser(pool, id(req), admins(), now()));
  app.post('/admin/api/users/:id/block', guard, async (req) => {
    await blockUser(
      pool,
      actor(req),
      admins(),
      id(req),
      parse(blockBody, req.body ?? {}).reason,
      now(),
    );
    return { ok: true };
  });
  app.post('/admin/api/users/:id/unblock', guard, async (req) => {
    await unblockUser(pool, actor(req), admins(), id(req));
    return { ok: true };
  });
  app.post('/admin/api/users/:id/sign-out', guard, async (req) =>
    signOutUser(pool, actor(req), admins(), id(req), now()),
  );
  app.post('/admin/api/institutes/:id/plan', guard, async (req) =>
    setPlan(pool, actor(req), id(req), parse(planBody, req.body), now()),
  );
  app.get('/admin/api/logins', guard, async () => ({ logins: await recentLogins(pool, now()) }));
  app.get('/admin/api/audit', guard, async () => ({ audit: await auditLog(pool) }));

  // ---- analytics, centres, WhatsApp, system, announcements, search, exports ----
  app.get('/admin/api/analytics', guard, async (req) => {
    const { days } = parse(
      z.object({ days: z.coerce.number().int().min(7).max(180).default(30) }),
      req.query,
    );
    return analytics(pool, days, now());
  });
  const instQuery = z.object({
    q: z.string().trim().max(80).default(''),
    sort: z.enum(['activity', 'students', 'health', 'newest', 'expiring']).default('activity'),
    filter: z.enum(['all', 'trial', 'paid', 'ended', 'at-risk']).default('all'),
  });
  app.get('/admin/api/institutes', guard, async (req) => ({
    institutes: await listInstitutes(pool, parse(instQuery, req.query), now()),
  }));
  app.get('/admin/api/institutes/:id', guard, async (req) => getInstitute(pool, id(req), now()));
  app.get('/admin/api/messages', guard, async (req) =>
    messagesMonitor(pool, parse(messagesQuery, req.query), now()),
  );
  app.post('/admin/api/messages/:id/retry', guard, async (req) => {
    await retryMessage(pool, actor(req), id(req), now());
    return { ok: true };
  });
  app.get('/admin/api/health', guard, async () =>
    systemHealth(
      pool,
      {
        version: VERSION,
        startedAt: STARTED_AT,
        provider: deps.providerName ?? 'none',
        templates: Object.entries(parseTemplates(config.WA_TEMPLATES)).map(
          ([type, t]) => `${type}: ${t?.en ?? '-'}`,
        ),
        publicBaseUrl: config.PUBLIC_BASE_URL ?? '',
      },
      now(),
    ),
  );
  app.get('/admin/api/announcements', guard, async () => ({
    announcements: await listAnnouncements(pool, now()),
  }));
  app.post('/admin/api/announcements', guard, async (req, reply) =>
    reply
      .code(201)
      .send(await createAnnouncement(pool, actor(req), parse(announcementBody, req.body), now())),
  );
  app.post('/admin/api/announcements/:id/end', guard, async (req) => {
    await endAnnouncement(pool, actor(req), id(req), now());
    return { ok: true };
  });
  app.get('/admin/api/search', guard, async (req) =>
    quickSearch(pool, parse(z.object({ q: z.string().max(80).default('') }), req.query).q),
  );
  const csv = (name: string, body: string) => (reply: import('fastify').FastifyReply) =>
    reply
      .header('Content-Disposition', `attachment; filename="${name}"`)
      .header('Cache-Control', 'no-store')
      .type('text/csv; charset=utf-8')
      .send(body);
  app.get('/admin/api/export/users.csv', guard, async (_req, reply) => {
    const users = await listUsers(
      pool,
      { q: '', filter: 'all', limit: 200, offset: 0 },
      admins(),
      now(),
    );
    let all = users;
    for (let off = 200; users.length && all.length === off; off += 200)
      all = all.concat(
        await listUsers(pool, { q: '', filter: 'all', limit: 200, offset: off }, admins(), now()),
      );
    return csv(
      'chalkpis-logins.csv',
      toCsv([
        [
          'Name',
          'Phone',
          'Role',
          'Institute',
          'Plan',
          'Plan active',
          'Students',
          'Joined',
          'Last login',
          'Blocked',
        ],
        ...all.map((u) => [
          u.name,
          u.phone,
          u.role ?? '',
          u.institute?.name ?? '',
          u.institute?.plan ?? '',
          u.institute?.active ?? '',
          u.institute?.students ?? '',
          u.createdAt,
          u.lastLoginAt ?? '',
          u.blocked,
        ]),
      ]),
    )(reply);
  });
  app.get('/admin/api/export/institutes.csv', guard, async (_req, reply) => {
    const list = await listInstitutes(pool, { q: '', sort: 'newest', filter: 'all' }, now());
    return csv(
      'chalkpis-institutes.csv',
      toCsv([
        [
          'Institute',
          'Owner',
          'Owner phone',
          'Plan',
          'Plan active',
          'Ends',
          'Students',
          'Batches',
          'Helpers',
          'Last activity',
          'WhatsApp sent (30 d)',
          'Fees recorded (30 d, Rs)',
          'Health',
          'Created',
        ],
        ...list.map((i) => [
          i.name,
          i.owner?.name ?? '',
          i.owner?.phone ?? '',
          i.plan ?? '',
          i.planActive,
          i.expiresAt ?? '',
          i.students,
          i.batches,
          i.staff,
          i.lastActivityAt ?? '',
          i.messages30,
          i.collected30 / 100,
          i.health,
          i.createdAt,
        ]),
      ]),
    )(reply);
  });

  // ---- for tutors and helpers in the app: live announcements ----
  app.get('/announcements', { preHandler: authenticate(deps) }, async (req) => ({
    announcements: await liveAnnouncements(pool, req.auth!.role, now()),
  }));

  const file =
    (name: string, type: string) => async (_req: unknown, reply: import('fastify').FastifyReply) =>
      reply
        .header('Content-Security-Policy', ADMIN_CSP)
        .header('Referrer-Policy', 'no-referrer')
        .header('X-Robots-Tag', 'noindex, nofollow')
        .header('Cache-Control', 'no-store')
        .type(type)
        .send(await readFile(path.join(PUBLIC_DIR, name)));
  app.get('/admin', file('admin.html', 'text/html; charset=utf-8'));
  app.get('/admin.js', file('admin.js', 'text/javascript; charset=utf-8'));
  app.get('/admin.css', file('admin.css', 'text/css; charset=utf-8'));
}
