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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().regex(/^[A-Za-z0-9_]{1,64}$/, 'letters, digits and underscore only'),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DB_SSL: flag('false'),

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
  return cfg;
}
