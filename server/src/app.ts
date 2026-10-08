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
import { batchRoutes } from './routes/batches.js';
import { studentRoutes } from './routes/students.js';
import { attendanceRoutes } from './routes/attendance.js';
import { feeRoutes } from './routes/fees.js';
import { billingRoutes } from './routes/billing.js';
import { messageRoutes } from './routes/messages.js';
import { fileRoutes } from './routes/files.js';
import { parentRoutes } from './routes/parent.js';
import { instituteRoutes } from './routes/institutes.js';

export interface AppDeps {
  config: Config;
  pool: Pool;
  /** Where log lines go (tests capture them to check nothing sensitive is written). */
  logStream?: NodeJS.WritableStream;
  /** Sends login codes. Null means not configured: the login-code route answers 503. */
  provider?: MessageProvider | null;
  /** Creates plan payment links. Null means not configured: buying answers 503. */
  billing?: BillingProvider | null;
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
  clock,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.TRUST_PROXY,
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

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
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
  authRoutes(app, { config, pool, provider, clock });
  instituteRoutes(app, { config, pool, clock });
  batchRoutes(app, { config, pool, clock });
  studentRoutes(app, { config, pool, clock });
  attendanceRoutes(app, { config, pool, clock });
  feeRoutes(app, { config, pool, clock });
  messageRoutes(app, { config, pool, clock });
  fileRoutes(app, { config, pool, clock });
  parentRoutes(app, { config, pool, clock });
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
