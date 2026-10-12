import type { FastifyInstance, FastifyRequest } from 'fastify';
import { clientPlatform } from '../activity.js';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate } from '../auth/guard.js';
import { confirmPhoneOwnership, requestOtp, verifyOtp } from '../auth/otp.js';
import { endSession, refreshSession, startSession } from '../auth/sessions.js';
import type { MessageProvider } from '../messaging/provider.js';

const phoneBody = z.object({ phone: z.string().max(32) });
const verifyBody = z.object({ phone: z.string().max(32), code: z.string().max(10) });
const addPhoneBody = z.object({ phone: z.string().max(32), code: z.string().max(10) });
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
      phone: string | null;
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
    isAdmin: !!r.phone && deps.config.ADMIN_PHONES.includes(r.phone),
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
  const now = () => (deps.clock ?? (() => new Date()))();

  /** A verified WhatsApp code ends here: a blocked account is refused, otherwise a new session and the profile. */
  const signIn = async (
    userId: string,
    req: FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => {
    // Checked only after the person proved who they are, so a blocked account cannot be discovered by guessing.
    if (await isBlocked(deps.pool, userId))
      return reply.code(403).send({ error: 'account_blocked' });
    await deps.pool.query('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), userId]);
    // from which phone, for the admin's sign-in mix and each centre's log
    await deps.pool.query(
      "INSERT INTO login_events (user_id, method, platform, created_at) VALUES (?, 'whatsapp', ?, ?)",
      [userId, clientPlatform(req), now()],
    );
    const session = await startSession(sessionDeps, userId);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      ...(await profile(deps, userId)),
    };
  };

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
      // a new number gets its account here: signing up and signing in are the same step
      const v = await verifyOtp(otpDeps, body.data.phone, body.data.code);
      if (!v.ok) return reply.code(401).send({ error: 'invalid_code' });
      return signIn(v.userId, req, reply);
    },
  );

  // Older app builds ask which sign-in buttons to show; WhatsApp is the only way in now.
  app.get('/auth/methods', async () => ({
    whatsapp: !!deps.provider && !!deps.config.WA_TEMPLATE_OTP,
    email: false,
    google: false,
    apple: false,
    appleNative: false,
  }));

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

  // ---- adding a mobile number to an older account that has none (made before WhatsApp was the only sign-in) ----
  app.post(
    '/me/phone/request',
    {
      preHandler: authenticate(deps),
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      if (req.auth!.phone) return reply.code(409).send({ error: 'phone_already_set' });
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
    '/me/phone/verify',
    {
      preHandler: authenticate(deps),
      config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    },
    async (req, reply) => {
      const me = req.auth!;
      if (me.phone) return reply.code(409).send({ error: 'phone_already_set' });
      const body = addPhoneBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const v = await confirmPhoneOwnership(otpDeps, body.data.phone, body.data.code);
      if (!v.ok) return reply.code(401).send({ error: 'invalid_code' });
      // a number that already has its own Chalkpis account is not moved (that would be two people's data)
      if (v.userId && v.userId !== me.userId)
        return reply.code(409).send({ error: 'phone_in_use' });
      try {
        await deps.pool.query('UPDATE users SET phone = ? WHERE id = ? AND phone IS NULL', [
          v.phone,
          me.userId,
        ]);
      } catch (e) {
        if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
          return reply.code(409).send({ error: 'phone_in_use' });
        throw e;
      }
      // the centre this person owns shows the number too, if it had none
      await deps.pool.query(
        "UPDATE institutes SET phone = ? WHERE owner_user_id = ? AND phone = ''",
        [v.phone, me.userId],
      );
      return profile(deps, me.userId);
    },
  );
}
