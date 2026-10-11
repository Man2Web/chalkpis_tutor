import type { FastifyInstance, FastifyRequest } from 'fastify';
import { clientPlatform } from '../activity.js';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate } from '../auth/guard.js';
import { requestEmailCode, verifyEmailCode } from '../auth/emailOtp.js';
import {
  consumeTicket,
  createTicket,
  findAccount,
  identitiesOf,
  linkIdentity,
  type Identity,
} from '../auth/identity.js';
import type { Mailer } from '../auth/mailer.js';

type SignInMethod = 'whatsapp' | 'google' | 'apple' | 'email';
import {
  allowedRedirect,
  newNonce,
  readState,
  signState,
  type OAuthProvider,
  type OAuthProviderName,
} from '../auth/oauth.js';
import { requestOtp, verifyOtp } from '../auth/otp.js';
import { endSession, refreshSession, startSession } from '../auth/sessions.js';
import type { MessageProvider } from '../messaging/provider.js';

const phoneBody = z.object({ phone: z.string().max(32) });
const verifyBody = z.object({
  phone: z.string().max(32),
  code: z.string().max(10),
  // set when a new Google / Apple / email sign-in is finishing by verifying the mobile number
  signupToken: z.string().max(100).optional(),
});
const emailBody = z.object({ email: z.string().max(254) });
const emailVerifyBody = z.object({ email: z.string().max(254), code: z.string().max(10) });
const ticketBody = z.object({ ticket: z.string().max(100) });
const meBody = z
  .object({ name: z.string().trim().min(2).max(80), language: z.enum(['en', 'hi']) })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
const tokenBody = z.object({ refreshToken: z.string().max(200) });

type Deps = Pick<AppDeps, 'config' | 'pool'> & {
  provider: MessageProvider | null;
  mailer?: Mailer | null;
  oauth?: Partial<Record<OAuthProviderName, OAuthProvider>>;
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
    `SELECT u.id, u.phone, u.email, u.name, u.language, m.institute_id, m.role, m.onboarding_done
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id WHERE u.id = ?`,
    [userId],
  )) as unknown as [
    {
      id: string;
      phone: string;
      email: string | null;
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
    user: { id: r.id, phone: r.phone, email: r.email, name: r.name, language: r.language },
    signInMethods: await identitiesOf(deps.pool, r.id),
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
  const now = () => (deps.clock ?? (() => new Date()))();

  /** Every sign-in method ends here: a blocked account is refused, otherwise a new session and the profile. */
  const signIn = async (
    userId: string,
    method: SignInMethod,
    req: FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => {
    // Checked only after the person proved who they are, so a blocked account cannot be discovered by guessing.
    if (await isBlocked(deps.pool, userId))
      return reply.code(403).send({ error: 'account_blocked' });
    await deps.pool.query('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), userId]);
    // how and from which phone, for the admin's sign-in mix and each centre's log
    await deps.pool.query(
      'INSERT INTO login_events (user_id, method, platform, created_at) VALUES (?, ?, ?, ?)',
      [userId, method, clientPlatform(req), now()],
    );
    const session = await startSession(sessionDeps, userId);
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      ...(await profile(deps, userId)),
    };
  };

  /**
   * After Google, Apple or an email code: a known person is signed in; someone new is asked to verify a mobile
   * number once (WhatsApp code), which creates the account or links to the one that number already has.
   */
  const finish = async (
    identity: Identity,
    req: FastifyRequest,
    reply: import('fastify').FastifyReply,
  ) => {
    const userId = await findAccount(deps.pool, identity, now());
    if (userId) return signIn(userId, identity.provider, req, reply);
    const signupToken = await createTicket(deps.pool, 'signup', identity, now());
    return { needsPhone: true, signupToken, email: identity.email, name: identity.name ?? null };
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
      // A pending Google / Apple / email sign-up must still be valid before the code is spent on it.
      let pending: Identity | null = null;
      if (body.data.signupToken) {
        pending = await consumeTicket<Identity>(deps.pool, 'signup', body.data.signupToken, now());
        if (!pending) return reply.code(410).send({ error: 'signup_expired' });
      }
      const v = await verifyOtp(otpDeps, body.data.phone, body.data.code);
      if (!v.ok) return reply.code(401).send({ error: 'invalid_code' });
      // From now on that Google / Apple / email identity signs in to this mobile number's account (new or existing).
      if (pending) await linkIdentity(deps.pool, v.userId, pending, now());
      // a first Google / Apple / email sign-in finishes here, and counts as that method
      return signIn(v.userId, pending?.provider ?? 'whatsapp', req, reply);
    },
  );

  // ---- which sign-in methods are switched on (the app shows only these buttons) ----
  app.get('/auth/methods', async () => ({
    whatsapp: !!deps.provider && !!deps.config.WA_TEMPLATE_OTP,
    email: !!deps.mailer,
    google: !!deps.oauth?.google && !!deps.config.PUBLIC_BASE_URL,
    apple: !!deps.oauth?.apple && !!deps.config.PUBLIC_BASE_URL,
  }));

  // ---- email: a 6-digit code to the inbox, no password ----
  const emailDeps = {
    pool: deps.pool,
    config: deps.config,
    mailer: deps.mailer ?? null,
    clock: deps.clock,
  };
  app.post(
    '/auth/email/request',
    { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = emailBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const r = await requestEmailCode(emailDeps, body.data.email);
      if (r.ok) {
        const echo = deps.config.OTP_DEV_ECHO && deps.config.NODE_ENV !== 'production';
        return {
          ok: true,
          email: r.email,
          resendInSeconds: r.resendInSeconds,
          ...(echo ? { devCode: r.code } : {}),
        };
      }
      if (r.error === 'invalid_email') return reply.code(400).send({ error: 'invalid_email' });
      if (r.error === 'unavailable') return reply.code(503).send({ error: 'email_unavailable' });
      return reply
        .code(429)
        .header('Retry-After', String(r.retryAfter ?? 60))
        .send({ error: r.error, retryAfter: r.retryAfter });
    },
  );
  app.post(
    '/auth/email/verify',
    { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = emailVerifyBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const email = await verifyEmailCode(emailDeps, body.data.email, body.data.code.trim());
      if (!email) return reply.code(401).send({ error: 'invalid_code' });
      return finish({ provider: 'email', subject: email, email, emailVerified: true }, req, reply);
    },
  );

  // ---- Google and Apple: the app opens /start in a browser sheet and gets a one-time ticket back ----
  const callbackUrl = (p: OAuthProviderName) =>
    `${(deps.config.PUBLIC_BASE_URL ?? '').replace(/\/$/, '')}/auth/oauth/${p}/callback`;
  const back = (redirect: string, q: Record<string, string>) =>
    `${redirect}${redirect.includes('?') ? '&' : '?'}${new URLSearchParams(q)}`;

  app.get<{ Params: { provider: string }; Querystring: { redirect?: string } }>(
    '/auth/oauth/:provider/start',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const p = req.params.provider as OAuthProviderName;
      const provider = deps.oauth?.[p];
      if (!provider || !deps.config.PUBLIC_BASE_URL)
        return reply.code(404).send({ error: 'not_found' });
      const redirect = req.query.redirect;
      if (!allowedRedirect(redirect, deps.config.APP_REDIRECT_PREFIXES))
        return reply.code(400).send({ error: 'bad_redirect' });
      const nonce = newNonce();
      const state = await signState(
        deps.config.JWT_SECRET,
        { provider: p, redirect, nonce },
        now().getTime(),
      );
      return reply.redirect(provider.authorizeUrl({ state, nonce, redirectUri: callbackUrl(p) }));
    },
  );

  // Both callbacks: check the signed state, exchange the code, then send the person back to the app with a
  // short one-time ticket (never the identity itself in the URL).
  const callback = async (
    p: OAuthProviderName,
    q: Record<string, string | undefined>,
    reply: import('fastify').FastifyReply,
  ) => {
    const state = await readState(deps.config.JWT_SECRET, q.state, now().getTime());
    if (
      !state ||
      state.provider !== p ||
      !allowedRedirect(state.redirect, deps.config.APP_REDIRECT_PREFIXES)
    )
      return reply
        .code(400)
        .type('text/plain')
        .send('This sign-in link has expired. Go back to the app and try again.');
    if (q.error || !q.code) return reply.redirect(back(state.redirect, { error: 'cancelled' }));
    try {
      const identity = await deps.oauth![p]!.exchange({
        code: q.code,
        nonce: state.nonce,
        redirectUri: callbackUrl(p),
        extra: q.user ? { user: q.user } : undefined,
      });
      const ticket = await createTicket(deps.pool, 'oauth', identity, now());
      return reply.redirect(back(state.redirect, { ticket }));
    } catch {
      return reply.redirect(back(state.redirect, { error: 'failed' }));
    }
  };
  app.get<{ Querystring: Record<string, string> }>(
    '/auth/oauth/google/callback',
    async (req, reply) =>
      deps.oauth?.google
        ? callback('google', req.query, reply)
        : reply.code(404).send({ error: 'not_found' }),
  );
  // Apple posts the result as a form.
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 16 * 1024 },
      (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))),
    );
    scope.post<{ Body: Record<string, string> }>(
      '/auth/oauth/apple/callback',
      async (req, reply) =>
        deps.oauth?.apple
          ? callback('apple', (req.body ?? {}) as Record<string, string>, reply)
          : reply.code(404).send({ error: 'not_found' }),
    );
  });

  // The app trades the one-time ticket for a session (or for "verify your mobile" if the person is new).
  app.post(
    '/auth/ticket',
    { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const body = ticketBody.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: 'bad_request' });
      const identity = await consumeTicket<Identity>(deps.pool, 'oauth', body.data.ticket, now());
      if (!identity) return reply.code(401).send({ error: 'invalid_ticket' });
      return finish(identity, req, reply);
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
