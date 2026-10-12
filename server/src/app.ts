import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { ping, type Pool } from './db.js';
import { safeUrl } from './logging.js';
import type { BillingProvider } from './billing/provider.js';
import type { MessageProvider } from './messaging/provider.js';
import { authRoutes } from './routes/auth.js';
import type { Mailer } from './auth/mailer.js';
import type { AppleNativeVerifier, OAuthProvider, OAuthProviderName } from './auth/oauth.js';
import { batchRoutes } from './routes/batches.js';
import { studentRoutes } from './routes/students.js';
import { attendanceRoutes } from './routes/attendance.js';
import { feeRoutes } from './routes/fees.js';
import { billingRoutes } from './routes/billing.js';
import { messageRoutes } from './routes/messages.js';
import { fileRoutes } from './routes/files.js';
import { parentRoutes } from './routes/parent.js';
import { accountRoutes } from './routes/account.js';
import { staffRoutes } from './routes/staff.js';
import { taskRoutes } from './routes/tasks.js';
import { legalRoutes } from './routes/legal.js';
import { adminRoutes } from './routes/admin.js';
import { instituteRoutes } from './routes/institutes.js';
import { activityLog } from './activity.js';
import { idempotency } from './idempotency.js';

export interface AppDeps {
  config: Config;
  pool: Pool;
  /** Where log lines go (tests capture them to check nothing sensitive is written). */
  logStream?: NodeJS.WritableStream;
  /** Sends login codes. Null means not configured: the login-code route answers 503. */
  provider?: MessageProvider | null;
  /** Creates plan payment links. Null means not configured: buying answers 503. */
  billing?: BillingProvider | null;
  /** Sends sign-in codes by email. Null means not configured: email sign-in is hidden. */
  mailer?: Mailer | null;
  /** "Sign in with Google / Apple" providers that are configured. */
  oauth?: Partial<Record<OAuthProviderName, OAuthProvider>>;
  /** Checks native Sign in with Apple tokens from the iPhone app; null switches it off. */
  appleNative?: AppleNativeVerifier | null;
  /** Test hook: the current time. */
  clock?: () => Date;
}

/** Builds the HTTP app. No port is opened here, so tests can call it directly. */
export async function buildApp({
  config,
  pool,
  logStream,
  provider = null,
  billing = null,
  mailer = null,
  oauth = {},
  appleNative = null,
  clock,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    // exactly one proxy (Traefik) sits in front: trust its hop only, so a client cannot choose its own IP by
    // sending X-Forwarded-For (that would bypass the per-IP limits on codes and emails)
    trustProxy: config.TRUST_PROXY ? (_addr: string, hop: number) => hop < 1 : false,
    bodyLimit: 1024 * 1024,
    logger: {
      level: config.LOG_LEVEL,
      ...(logStream ? { stream: logStream } : {}),
      // Request lines carry the method and a cleaned path only; never headers, bodies or query strings.
      serializers: {
        req: (req) => ({ method: req.method, url: safeUrl(req.url ?? '') }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

  // A request that says JSON but sends no body (a bare DELETE or POST) means "no body", not a malformed one.
  // Anything non-empty still goes through Fastify's own parser, with its prototype-poisoning protection.
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') done(null, undefined);
    else parseJson(req, text, done);
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  if (config.CORS_ORIGINS.length)
    await app.register(cors, {
      origin: config.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['authorization', 'content-type', 'x-client-platform', 'idempotency-key'],
      maxAge: 600,
    });
  // Nothing from this API may be stored by a browser or a proxy unless the route says so (logos, the parent page files).
  app.addHook('onSend', async (_req, reply) => {
    if (!reply.hasHeader('cache-control')) reply.header('Cache-Control', 'no-store');
  });
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute',
  });

  // Liveness: the process is up. Readiness: it can also reach the database.
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health', async (_req, reply) => {
    if (await ping(pool)) return { status: 'ok', db: 'up' };
    return reply.code(503).send({ status: 'unavailable' });
  });

  app.decorateRequest('auth', null);
  // every successful change inside a centre is written to its log (see activity.ts)
  activityLog(app, pool, clock);
  // a repeated create / money request with the same Idempotency-Key gets the first answer back (see idempotency.ts)
  idempotency(app, pool, config, clock);
  authRoutes(app, { config, pool, provider, clock, mailer, oauth, appleNative });
  instituteRoutes(app, { config, pool, clock });
  batchRoutes(app, { config, pool, clock });
  studentRoutes(app, { config, pool, clock });
  attendanceRoutes(app, { config, pool, clock });
  feeRoutes(app, { config, pool, clock });
  messageRoutes(app, { config, pool, clock });
  fileRoutes(app, { config, pool, clock });
  parentRoutes(app, { config, pool, clock });
  accountRoutes(app, { config, pool, clock });
  staffRoutes(app, { config, pool, clock });
  taskRoutes(app, { config, pool, clock });
  legalRoutes(app);
  adminRoutes(app, { config, pool, clock, mailer, providerName: provider?.name ?? 'none' });
  billingRoutes(app, { config, pool, billing, clock });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' }));
  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError)
      return reply.code(err.status).send({ error: err.code, ...err.extra });
    const status =
      typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;
    if (status >= 500)
      req.log.error(
        { err: { name: err.name, code: (err as { code?: string }).code } },
        'request failed',
      );
    return reply.code(status).send({
      error: status === 500 ? 'internal' : status === 429 ? 'rate_limited' : 'bad_request',
    });
  });

  return app;
}
