import { z } from 'zod';

const flag = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default('0.0.0.0'),
  /** True when a reverse proxy (Coolify/Traefik) sits in front, so the real client address is read from X-Forwarded-For. */
  TRUST_PROXY: flag('false'),
  /** Requests allowed per minute from one address (the login routes have their own, stricter limits). */
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(10).max(1_000_000).default(300),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().regex(/^[A-Za-z0-9_]{1,64}$/, 'letters, digits and underscore only'),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DB_SSL: flag('false'),

  /** Secret that signs access tokens. 32+ random characters; changing it signs everyone out. */
  JWT_SECRET: z.string().min(32, 'at least 32 characters'),
  /** Secret mixed into stored login-code hashes. 32+ random characters. */
  OTP_PEPPER: z.string().min(32, 'at least 32 characters'),
  ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),
  /** Development only: also return the login code in the response so it can be tried without WhatsApp. Ignored in production. */
  OTP_DEV_ECHO: flag('false'),

  /** WhatsApp gateway for login codes. Optional at start; without it the login-code route answers 503. */
  WA_API_URL: z.string().url().optional(),
  WA_FROM: z
    .string()
    .regex(/^\d{10,15}$/, 'digits only, with country code')
    .optional(),
  WA_CLIENT_ID: z.string().min(1).optional(),
  WA_CLIENT_PASSWORD: z.string().min(1).optional(),
  WA_API_METHOD: z.enum(['POST', 'GET']).default('POST'),
  /** Approved authentication template id for the login code (one value: the code). */
  WA_TEMPLATE_OTP: z.string().min(1).optional(),

  /** Folder for uploaded logos and student photos. In the container this is a mounted volume (/data/uploads) so files survive deploys. */
  FILES_DIR: z.string().min(1).default('data/files'),
  /** The public address of this server, e.g. https://api.example.in. Used to build parent links and logo addresses. */
  PUBLIC_BASE_URL: z.string().url().optional(),
  /** JSON: { "absent": { "en": "id", "hi": "id" }, ... } for the 5 parent messages (see docs/WHATSAPP-TEMPLATES.md). */
  WA_TEMPLATES: z.string().optional(),
  /** Razorpay (plan purchases). Without keys the server uses the local mock in development and answers 503 in production. */
  RAZORPAY_KEY_ID: z.string().min(1).optional(),
  RAZORPAY_KEY_SECRET: z.string().min(1).optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(16).optional(),

  /** Run pending migrations when the server starts. Safe: guarded by a database lock. */
  AUTO_MIGRATE: flag('true'),
});

export type Config = z.infer<typeof schema>;

/** Reads settings from the environment. A missing or bad value stops the server at start-up with a clear message, never later. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(config)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${problems}`);
  }
  const cfg = parsed.data;
  if (
    cfg.NODE_ENV === 'production' &&
    ['password', 'tutordesk-local', 'changeme'].includes(cfg.DB_PASSWORD)
  ) {
    throw new Error(
      'Invalid configuration:\n  DB_PASSWORD: refusing a placeholder password in production',
    );
  }
  if (cfg.NODE_ENV === 'production') {
    for (const k of ['JWT_SECRET', 'OTP_PEPPER'] as const) {
      if (/^(.)\1+$/.test(cfg[k]) || /change|secret|example|password/i.test(cfg[k]))
        throw new Error(
          `Invalid configuration:\n  ${k}: looks like a placeholder; use long random text`,
        );
    }
  }
  return cfg;
}
