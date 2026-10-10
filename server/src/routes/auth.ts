import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate } from '../auth/guard.js';
import { requestOtp, verifyOtp } from '../auth/otp.js';
import { endSession, refreshSession, startSession } from '../auth/sessions.js';
import type { MessageProvider } from '../messaging/provider.js';

const phoneBody = z.object({ phone: z.string().max(32) });
const verifyBody = z.object({ phone: z.string().max(32), code: z.string().max(10) });
const meBody = z
  .object({ name: z.string().trim().min(2).max(80), language: z.enum(['en', 'hi']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
const tokenBody = z.object({ refreshToken: z.string().max(200) });

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  provider: MessageProvider | null;
  clock?: () => Date;
};

async function isBlocked(pool: Deps['pool'], userId: string) {
  const [rows] = (await pool.query('SELECT blocked_at FROM users WHERE id = ?', [
    userId,
  ])) as unknown as [{ blocked_at: Date | null }[]];
  return !!rows[0]?.blocked_at;
}

/** The profile the app needs right after login. Never includes anything about other users. */
async function profile(deps: Deps, userId: string) {
  const [rows] = (await deps.pool.query(
    `SELECT u.id, u.phone, u.name, u.language, m.institute_id, m.role, m.onboarding_done
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id WHERE u.id = ?`,
    [userId],
  )) as unknown as [
    {
      id: string;
      phone: string;
      name: string;
      language: string;
      institute_id: string | null;
      role: string | null;
      onboarding_done: number | null;
    }[],
  ];
  const r = rows[0];
  if (!r) return null;
  return {
    user: { id: r.id, phone: r.phone, name: r.name, language: r.language },
    isAdmin: deps.config.ADMIN_PHONES.includes(r.phone),
    membership: r.institute_id
      ? { instituteId: r.institute_id, role: r.role, onboardingDone: !!r.onboarding_done }
      : null,
  };
}

export function authRoutes(app: FastifyInstance, deps: Deps) {
  const otpDeps = {
    pool: deps.pool,
    config: deps.config,
    provider: deps.provider,
    clock: deps.clock,
  };
  const sessionDeps = { pool: deps.pool, config: deps.config, clock: deps.clock };

  app.post(
    '/auth/otp/request',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = phoneBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const r = await requestOtp(otpDeps, body.data.phone);
      if (r.ok) {
        const echo = deps.config.OTP_DEV_ECHO && deps.config.NODE_ENV !== 'production';
        return {
          ok: true,
          resendInSeconds: r.resendInSeconds,
          ...(echo ? { devCode: r.code } : {}),
        };
      }
      if (r.error === 'invalid_phone') return reply.code(400).send({ error: 'invalid_phone' });
      if (r.error === 'unavailable') return reply.code(503).send({ error: 'otp_unavailable' });
      return reply
        .code(429)
        .header('Retry-After', String(r.retryAfter ?? 60))
        .send({ error: r.error, retryAfter: r.retryAfter });
    },
  );

  app.post(
    '/auth/otp/verify',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = verifyBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const v = await verifyOtp(otpDeps, body.data.phone, body.data.code);
      if (!v.ok) return reply.code(401).send({ error: 'invalid_code' });
      // Checked only after a correct code, so a blocked number cannot be discovered by guessing.
      if (await isBlocked(deps.pool, v.userId))
        return reply.code(403).send({ error: 'account_blocked' });
      await deps.pool.query('UPDATE users SET last_login_at = ? WHERE id = ?', [
        (deps.clock ?? (() => new Date()))(),
        v.userId,
      ]);
      await deps.pool.query('INSERT INTO login_events (user_id, created_at) VALUES (?, ?)', [
        v.userId,
        (deps.clock ?? (() => new Date()))(),
      ]);
      const session = await startSession(sessionDeps, v.userId);
      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresIn: session.expiresIn,
        ...(await profile(deps, v.userId)),
      };
    },
  );

  app.post(
    '/auth/refresh',
    { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = tokenBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const s = await refreshSession(sessionDeps, body.data.refreshToken);
      if (!s) return reply.code(401).send({ error: 'invalid_token' });
      return { accessToken: s.accessToken, refreshToken: s.refreshToken, expiresIn: s.expiresIn };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    const body = tokenBody.safeParse(req.body);
    if (body.success) await endSession(sessionDeps, body.data.refreshToken);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: authenticate(deps) }, async (req) =>
    profile(deps, req.auth!.userId),
  );

  // The person's own name and language. Always allowed (even when the plan has ended): it is their profile.
  app.patch('/me', { preHandler: authenticate(deps) }, async (req, reply) => {
    const body = meBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    await deps.pool.query(
      'UPDATE users SET name = COALESCE(?, name), language = COALESCE(?, language) WHERE id = ?',
      [body.data.name ?? null, body.data.language ?? null, req.auth!.userId],
    );
    return profile(deps, req.auth!.userId);
  });
}
