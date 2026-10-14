import type { PushSender } from '../push/expo.js';
import {
  announcementInput,
  audienceInput,
  createAnnouncement,
  dispatchDuePushes,
  endAnnouncement,
  estimateAudience,
  eventInput,
  inboxFor,
  listForAdmin,
  liveFor,
  markAllRead,
  recordEvent,
  testPush,
} from '../announcements/service.js';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppDeps } from '../app.js';
import {
  audit,
  auditLog,
  blockBody,
  blockUser,
  getUser,
  listUsers,
  overview,
  planBody,
  planPaymentBody,
  recordPlanPayment,
  setSubscription,
  subscriptionBody,
  recentLogins,
  setPlan,
  signOutUser,
  unblockUser,
  userListQuery,
} from '../admin/service.js';
import { analytics, getInstitute, listInstitutes } from '../admin/analytics.js';
import { billingOverview, billingQuery } from '../admin/billing.js';
import { payUrl } from '../billing/payLink.js';
import {
  messagesMonitor,
  messagesQuery,
  quickSearch,
  retryMessage,
  systemHealth,
  toCsv,
} from '../admin/ops.js';
import {
  addNote,
  cohorts,
  deleteNote,
  events,
  eventsQuery,
  noteBody,
  notes,
  setTags,
  tagsBody,
} from '../admin/crm.js';
import { authenticate } from '../auth/guard.js';
import type { Mailer } from '../auth/mailer.js';
import {
  adminForgot,
  adminLogin,
  adminLogout,
  adminReset,
  adminSession,
  adminVerify,
  ensureAdmins,
  type AdminIdentity,
} from '../admin/auth.js';
import { parseTemplates } from '../messaging/templates.js';
import { idParam, parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  clock?: () => Date;
  /** Sends admin sign-in and reset codes. */
  mailer?: Mailer | null;
  /** Which WhatsApp sender is in use, for the health screen. */
  providerName?: string;
  /** Push notifications (announcements can go out as one too). */
  push?: PushSender | null;
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
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminIdentity;
  }
}

const bearer = (req: FastifyRequest) => {
  const h = req.headers.authorization;
  return typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : null;
};

/**
 * The platform owner's dashboard. The page itself is public (it is only a sign-in screen and a script); every
 * /admin/api call needs an admin session from /admin/auth (email + password + emailed code, see admin/auth.ts).
 * Tutor app tokens never reach it, whatever number they belong to.
 */
export function adminRoutes(app: FastifyInstance, deps: Deps) {
  const { pool, config } = deps;
  const authDeps = { pool, mailer: deps.mailer ?? null, config, clock: deps.clock };
  // the ADMIN_EMAILS accounts exist before anyone signs in; a database hiccup at start must not stop the server,
  // so it is tried again on the first admin sign-in or reset
  let adminsReady = false;
  const readyAdmins = async () => {
    if (adminsReady) return;
    try {
      await ensureAdmins(pool, config.ADMIN_EMAILS);
      adminsReady = true;
    } catch (err) {
      app.log.warn({ err: { message: (err as Error).message } }, 'admin accounts not ready yet');
    }
  };
  app.addHook('onReady', readyAdmins);
  const requireAdminSession = async (
    req: FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => {
    const who = await adminSession(authDeps, bearer(req));
    if (!who) return reply.code(401).send({ error: 'unauthorized' });
    req.admin = who;
  };
  const guard = {
    preHandler: [requireAdminSession],
    config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
  };
  const now = () => (deps.clock ?? (() => new Date()))();
  // who did it, for the audit log: the admin account and its email
  const actor = (req: FastifyRequest) => ({ userId: req.admin!.adminId, phone: req.admin!.email });
  const meta = (req: FastifyRequest) => ({
    ip: req.ip ?? '',
    userAgent: String(req.headers['user-agent'] ?? ''),
  });
  const authLimit = (max: number) => ({ config: { rateLimit: { max, timeWindow: '10 minutes' } } });
  const body = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;

  // ---- admin sign-in: password, then an emailed code; forgot password by emailed code ----
  app.post('/admin/auth/login', authLimit(10), async (req, reply) => {
    await readyAdmins();
    const r = await adminLogin(authDeps, body(req).email, body(req).password, meta(req));
    if (r.ok) return { challenge: r.challenge, ...(r.devCode ? { devCode: r.devCode } : {}) };
    return reply.code(r.error === 'unavailable' ? 503 : 401).send({ error: r.error });
  });
  app.post('/admin/auth/verify', authLimit(20), async (req, reply) => {
    const b = body(req);
    const r = await adminVerify(authDeps, b.email, b.challenge, b.code, meta(req));
    return r ?? reply.code(401).send({ error: 'invalid_code' });
  });
  app.post('/admin/auth/forgot', authLimit(5), async (req) => {
    await readyAdmins();
    return { ok: true, ...(await adminForgot(authDeps, body(req).email)) };
  });
  app.post('/admin/auth/reset', authLimit(10), async (req, reply) => {
    const b = body(req);
    const r = await adminReset(authDeps, b.email, b.code, b.password);
    return r.ok ? { ok: true } : reply.code(400).send({ error: r.error });
  });
  app.post('/admin/auth/logout', async (req) => {
    await adminLogout(authDeps, bearer(req));
    return { ok: true };
  });
  app.get('/admin/auth/me', guard, async (req) => ({ email: req.admin!.email }));
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
  app.put('/admin/api/institutes/:id/subscription', guard, async (req) =>
    setSubscription(pool, actor(req), id(req), parse(subscriptionBody, req.body)),
  );
  app.post('/admin/api/institutes/:id/plan-payments', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await recordPlanPayment(pool, actor(req), id(req), parse(planPaymentBody, req.body), now()),
      ),
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
  app.get('/admin/api/institutes/:id', guard, async (req) => ({
    ...(await getInstitute(pool, id(req), now())),
    // the centre's own pay page, to send to its owner on WhatsApp (see routes/pay.ts)
    payUrl: payUrl(config.PUBLIC_BASE_URL, config.JWT_SECRET, id(req)),
  }));
  app.get('/admin/api/billing', guard, async (req) =>
    billingOverview(pool, parse(billingQuery, req.query), now()),
  );
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
  app.get('/admin/api/announcements', guard, async () => listForAdmin(pool, now()));
  app.post('/admin/api/announcements', guard, async (req, reply) => {
    const created = await createAnnouncement(
      pool,
      actor(req),
      parse(announcementInput, req.body),
      now(),
    );
    // a push that is due now (not scheduled, not in quiet hours) goes out straight away; the rest go from the worker
    await dispatchDuePushes(pool, deps.push ?? null, now()).catch(() => 0);
    return reply.code(201).send(created);
  });
  app.post('/admin/api/announcements/estimate', guard, async (req) =>
    estimateAudience(pool, parse(audienceInput, req.body), now()),
  );
  app.post('/admin/api/announcements/test-push', guard, async (req) => {
    const b = parse(
      z.object({
        phone: z.string().max(20),
        title: z.string().trim().min(2).max(80),
        body: z.string().trim().max(400).default(''),
      }),
      req.body,
    );
    const r = await testPush(pool, deps.push ?? null, b.phone, b);
    await audit(pool, actor(req), 'announce-test', { detail: `${b.title} · ${r.sent} phones` });
    return r;
  });
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
  app.get('/admin/api/export/users.csv', guard, async (req, reply) => {
    // a bulk copy of personal data (every phone number): always in the audit log
    await audit(pool, actor(req), 'export-users', {});
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
  app.get('/admin/api/export/institutes.csv', guard, async (req, reply) => {
    await audit(pool, actor(req), 'export-institutes', {});
    const list = await listInstitutes(pool, { q: '', sort: 'newest', filter: 'all' }, now());
    return csv(
      'chalkpis-institutes.csv',
      toCsv([
        [
          'Institute',
          'Type',
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
          i.category,
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

  // ---- activity feed (all centres or one), cohorts, notes and tags ----
  app.get('/admin/api/events', guard, async (req) =>
    events(pool, parse(eventsQuery, req.query), now()),
  );
  // one centre's full log as a spreadsheet: the last 30 days, every kind, newest first
  app.get('/admin/api/institutes/:id/logs.csv', guard, async (req, reply) => {
    const instituteId = id(req);
    await audit(pool, actor(req), 'export-centre-logs', { instituteId });
    const { institute } = await getInstitute(pool, instituteId, now());
    const { events: rows } = await events(
      pool,
      { kinds: [], limit: 300, institute: instituteId, q: '' },
      now(),
    );
    const slug =
      institute.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'centre';
    return csv(
      `chalkpis-${slug}-logs.csv`,
      toCsv([
        ['When', 'Kind', 'Who', 'What', 'Amount (Rs)', 'Device'],
        ...rows.map((e) => [
          e.at,
          e.kind,
          e.actor,
          e.text,
          e.amount == null ? '' : e.amount / 100,
          e.platform ?? '',
        ]),
      ]),
    )(reply);
  });
  app.get('/admin/api/cohorts', guard, async (req) => {
    const { weeks } = parse(
      z.object({ weeks: z.coerce.number().int().min(2).max(26).default(10) }),
      req.query,
    );
    return cohorts(pool, weeks, now());
  });
  app.get('/admin/api/institutes/:id/notes', guard, async (req) => ({
    notes: await notes(pool, id(req)),
  }));
  app.post('/admin/api/institutes/:id/notes', guard, async (req, reply) =>
    reply
      .code(201)
      .send(await addNote(pool, actor(req), id(req), parse(noteBody, req.body).body, now())),
  );
  app.delete('/admin/api/institutes/:id/notes/:noteId', guard, async (req) => {
    const noteId = idParam((req.params as { noteId: string }).noteId);
    const said = await deleteNote(pool, id(req), noteId);
    await audit(pool, actor(req), 'note-delete', { instituteId: id(req), detail: said });
    return { ok: true };
  });
  app.put('/admin/api/institutes/:id/tags', guard, async (req) => {
    const tags = parse(tagsBody, req.body).tags;
    const r = await setTags(pool, id(req), tags);
    await audit(pool, actor(req), 'tags-set', { instituteId: id(req), detail: tags.join(', ') });
    return r;
  });

  // ---- for tutors and helpers in the app: banners, the Updates inbox, and what they did with each ----
  const viewer = (req: FastifyRequest) => ({
    userId: req.auth!.userId,
    role: req.auth!.role,
    instituteId: req.auth!.instituteId,
  });
  app.get('/announcements', { preHandler: authenticate(deps) }, async (req) => ({
    announcements: await liveFor(pool, viewer(req), now()),
  }));
  app.get('/me/updates', { preHandler: authenticate(deps) }, async (req) =>
    inboxFor(pool, viewer(req), now()),
  );
  app.post('/me/updates/read-all', { preHandler: authenticate(deps) }, async (req) =>
    markAllRead(pool, viewer(req), now()),
  );
  app.post('/announcements/:id/events', { preHandler: authenticate(deps) }, async (req) => {
    await recordEvent(pool, req.auth!.userId, id(req), parse(eventInput, req.body).type, now());
    return { ok: true };
  });

  const file =
    (name: string, type: string) => async (_req: unknown, reply: import('fastify').FastifyReply) =>
      reply
        .header('Content-Security-Policy', ADMIN_CSP)
        .header('Referrer-Policy', 'no-referrer')
        .header('X-Robots-Tag', 'noindex, nofollow')
        .header('Cache-Control', 'no-store')
        .type(type)
        .send(await readFile(path.join(PUBLIC_DIR, name)));
  // The dashboard is a small React app (server/admin-ui, shadcn/ui) built into public/admin: one page plus hashed
  // script, style and font files. Same origin only, under the same strict policy.
  const page = file(path.join('admin', 'index.html'), 'text/html; charset=utf-8');
  app.get('/admin', page);
  app.get('/admin/', page);
  const ASSET_TYPES: Record<string, string> = {
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  app.get<{ Params: { name: string } }>('/admin/assets/:name', async (req, reply) => {
    const name = req.params.name;
    const type = ASSET_TYPES[path.extname(name)];
    // built file names only: letters, digits, dash, underscore and one extension (no paths)
    if (!type || !/^[\w-]+\.[a-z0-9]+$/i.test(name))
      return reply.code(404).send({ error: 'not_found' });
    const body = await readFile(path.join(PUBLIC_DIR, 'admin', 'assets', name)).catch(() => null);
    if (!body) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('Content-Security-Policy', ADMIN_CSP)
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('Cache-Control', 'public, max-age=31536000, immutable') // names carry a content hash
      .type(type)
      .send(body);
  });
  // The Chalkpis logo for the dashboard: full (light and dark letters) and the mark alone. Fixed names only.
  const LOGOS = new Set(['logo', 'logo-dark', 'logo-mark']);
  app.get<{ Params: { name: string } }>('/admin-logo/:name', async (req, reply) => {
    const name = req.params.name.replace(/\.svg$/, '');
    if (!LOGOS.has(name)) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('Cache-Control', 'public, max-age=86400')
      .header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
      .type('image/svg+xml')
      .send(await readFile(path.join(PUBLIC_DIR, `${name}.svg`)));
  });
  // Inter for the dashboard, served from here because the CSP allows no outside fonts. Fixed names only.
  const FONTS = new Set([
    'Inter_400Regular',
    'Inter_500Medium',
    'Inter_600SemiBold',
    'Inter_700Bold',
  ]);
  app.get<{ Params: { name: string } }>('/admin-fonts/:name', async (req, reply) => {
    const name = req.params.name.replace(/\.ttf$/, '');
    if (!FONTS.has(name)) return reply.code(404).send({ error: 'not_found' });
    return reply
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Cross-Origin-Resource-Policy', 'same-origin')
      .type('font/ttf')
      .send(await readFile(path.join(PUBLIC_DIR, 'fonts', `${name}.ttf`)));
  });
}
