import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createInstitute } from '../src/institutes/service.js';
import { newId, sha256 } from '../src/lib/ids.js';
import { signToken } from '../src/lib/jwt.js';
import { runMigrations } from '../src/migrate.js';
import { MockBillingProvider, type BillingProvider } from '../src/billing/provider.js';
import type { Mailer } from '../src/auth/mailer.js';
import { MockProvider } from '../src/messaging/provider.js';
import { createTestDb, testConfig, type TestDb } from './db.js';

/** The admin email every test harness allows (testConfig ADMIN_EMAILS). */
export const TEST_ADMIN_EMAIL = 'admin@chalkpis.test';

export const WEBHOOK_SECRET = 'whsec_test_secret_0123456789';
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
  billing: MockBillingProvider;
  filesDir: string;
  clock: { now: Date };
  reset: () => Promise<void>;
  tenant: (phone: string, names?: { tutor?: string; institute?: string }) => Promise<Tenant>;
  /** Acts as a signed-in admin of the dashboard (email + password + code done; a live admin session). */
  admin: (email?: string) => Promise<Tenant>;
  /** Acts as an existing user (for example a helper the owner invited). */
  login: (userId: string, instituteId: string) => Tenant;
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
    headers?: Record<string, string>,
  ) => Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const TABLES = [
  'admin_sessions',
  'admin_codes',
  'admin_accounts',
  'idempotency_keys',
  'centre_messages',
  'auth_tickets',
  'auth_identities',
  'email_codes',
  'admin_notes',
  'admin_tags',
  'login_events',
  'activity_log',
  'announcements',
  'admin_audit',
  'tasks',
  'job_runs',
  'staff_batches',
  'parent_links',
  'messages',
  'notify_settings',
  'billing_events',
  'billing_orders',
  'payment_reports',
  'payments',
  'fee_dues',
  'attendance_marks',
  'attendance_days',
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
export async function startHarness(
  extra: Parameters<typeof testConfig>[0] = {},
  opts: {
    billing?: BillingProvider;
    mailer?: Mailer | null;
  } = {},
): Promise<Harness> {
  const db = await createTestDb();
  const filesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'td-files-'));
  await runMigrations(db.pool, MIGRATIONS);
  const provider = new MockProvider();
  const billing = new MockBillingProvider();
  const clock = { now: new Date(NOW) };
  const config = testConfig({
    ...db.config,
    WA_TEMPLATE_OTP: '1809804',
    RATE_LIMIT_PER_MIN: 100_000,
    FILES_DIR: filesDir,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
    ...extra,
  });
  const app = await buildApp({
    config,
    pool: db.pool,
    provider,
    billing: opts.billing ?? billing,
    mailer: opts.mailer ?? null,
    clock: () => clock.now,
  });

  const reset = async () => {
    await db.pool.query('SET FOREIGN_KEY_CHECKS=0');
    for (const t of TABLES) await db.pool.query(`TRUNCATE ${t}`);
    await db.pool.query('SET FOREIGN_KEY_CHECKS=1');
    clock.now = new Date(NOW);
    await fs.rm(filesDir, { recursive: true, force: true });
    await fs.mkdir(filesDir, { recursive: true });
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
    const call: Tenant['call'] = async (method, url, payload, headers = {}) => {
      const r = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}`, ...headers },
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

  const login: Harness['login'] = (userId, instituteId) => {
    const token = signToken(userId, config.JWT_SECRET, 900, clock.now.getTime());
    const call: Tenant['call'] = async (method, url, payload, headers = {}) => {
      const r = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}`, ...headers },
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

  const admin: Harness['admin'] = async (email = TEST_ADMIN_EMAIL) => {
    await db.pool.query('INSERT IGNORE INTO admin_accounts (id, email) VALUES (?, ?)', [
      newId(),
      email,
    ]);
    const [[a]] = (await db.pool.query('SELECT id FROM admin_accounts WHERE email = ?', [
      email,
    ])) as unknown as [[{ id: string }]];
    const token = randomBytes(32).toString('base64url');
    await db.pool.query(
      'INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [
        newId(),
        a!.id,
        sha256(token),
        new Date(clock.now.getTime() + 8 * 3_600_000),
        clock.now,
        clock.now,
      ],
    );
    const s = login(a!.id, '');
    const call: Tenant['call'] = async (method, url, payload, headers = {}) => {
      const r = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}`, ...headers },
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
    return { ...s, token, call };
  };

  return {
    db,
    app,
    provider,
    billing,
    filesDir,
    clock,
    reset,
    tenant,
    admin,
    login,
    close: async () => {
      await app.close();
      await db.drop();
      await fs.rm(filesDir, { recursive: true, force: true });
    },
  };
}
