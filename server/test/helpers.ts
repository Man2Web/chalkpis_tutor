import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createInstitute } from '../src/institutes/service.js';
import { newId } from '../src/lib/ids.js';
import { signToken } from '../src/lib/jwt.js';
import { runMigrations } from '../src/migrate.js';
import { MockProvider } from '../src/messaging/provider.js';
import { createTestDb, testConfig, type TestDb } from './db.js';

export const NOW = new Date('2026-10-08T06:00:00Z');
export const MIGRATIONS = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'migrations',
);

export interface Harness {
  db: TestDb;
  app: FastifyInstance;
  provider: MockProvider;
  clock: { now: Date };
  reset: () => Promise<void>;
  tenant: (phone: string, names?: { tutor?: string; institute?: string }) => Promise<Tenant>;
  close: () => Promise<void>;
}

export interface Tenant {
  userId: string;
  instituteId: string;
  token: string;
  call: (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown,
  ) => Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const TABLES = [
  'student_batches',
  'students',
  'batches',
  'refresh_tokens',
  'otp_codes',
  'subscriptions',
  'memberships',
  'institutes',
  'users',
];

/** A migrated throwaway database plus an app wired to it, with a fixed clock and a mock WhatsApp sender. */
export async function startHarness(extra: Parameters<typeof testConfig>[0] = {}): Promise<Harness> {
  const db = await createTestDb();
  await runMigrations(db.pool, MIGRATIONS);
  const provider = new MockProvider();
  const clock = { now: new Date(NOW) };
  const config = testConfig({
    ...db.config,
    WA_TEMPLATE_OTP: '1809804',
    RATE_LIMIT_PER_MIN: 100_000,
    ...extra,
  });
  const app = await buildApp({ config, pool: db.pool, provider, clock: () => clock.now });

  const reset = async () => {
    await db.pool.query('SET FOREIGN_KEY_CHECKS=0');
    for (const t of TABLES) await db.pool.query(`TRUNCATE ${t}`);
    await db.pool.query('SET FOREIGN_KEY_CHECKS=1');
    clock.now = new Date(NOW);
  };

  const tenant: Harness['tenant'] = async (phone, names = {}) => {
    const userId = newId();
    await db.pool.query('INSERT INTO users (id, phone) VALUES (?, ?)', [userId, phone]);
    const { instituteId } = await createInstitute(
      db.pool,
      userId,
      {
        tutorName: names.tutor ?? 'Tutor',
        instituteName: names.institute ?? `Institute ${phone}`,
        language: 'en',
      },
      clock.now,
    );
    const token = signToken(userId, config.JWT_SECRET, 900, clock.now.getTime());
    const call: Tenant['call'] = async (method, url, payload) => {
      const r = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        ...(payload === undefined ? {} : { payload: payload as object }),
      });
      let body: unknown = null;
      try {
        body = r.body ? r.json() : null;
      } catch {
        body = r.body;
      }
      return { status: r.statusCode, body };
    };
    return { userId, instituteId, token, call };
  };

  return {
    db,
    app,
    provider,
    clock,
    reset,
    tenant,
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
}
