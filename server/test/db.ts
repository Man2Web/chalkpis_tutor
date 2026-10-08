import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { Config } from '../src/config.js';
import { createPool, type Pool } from '../src/db.js';

/** The private database from `npm run db:start`. Local-only credentials, overridable for CI. */
const ADMIN = {
  host: process.env.TEST_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT ?? 3307),
  user: process.env.TEST_DB_USER ?? 'tutordesk',
  password: process.env.TEST_DB_PASSWORD ?? 'tutordesk-local',
};

export interface TestDb {
  pool: Pool;
  name: string;
  config: Config;
  drop: () => Promise<void>;
}

export const testConfig = (over: Partial<Config> = {}): Config => ({
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  RATE_LIMIT_PER_MIN: 300,
  TRIAL_DAYS: 7,
  CORS_ORIGINS: [],
  FILES_DIR: path.join(os.tmpdir(), 'tutordesk-test-files'),
  TRUST_PROXY: false,
  DB_HOST: ADMIN.host,
  DB_PORT: ADMIN.port,
  DB_USER: ADMIN.user,
  DB_PASSWORD: ADMIN.password,
  DB_NAME: 'x',
  DB_POOL_SIZE: 5,
  DB_SSL: false,
  AUTO_MIGRATE: false,
  JWT_SECRET: 'test-jwt-secret-test-jwt-secret-1234',
  OTP_PEPPER: 'test-otp-pepper-test-otp-pepper-1234',
  ACCESS_TTL_MINUTES: 15,
  REFRESH_TTL_DAYS: 60,
  OTP_DEV_ECHO: false,
  WA_API_METHOD: 'POST',
  ...over,
});

/** A fresh, empty database just for one test file, deleted afterwards. */
export async function createTestDb(): Promise<TestDb> {
  const name = `tutordesk_t_${randomBytes(5).toString('hex')}`;
  const admin = await mysql.createConnection(ADMIN);
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.end();
  const config = testConfig({ DB_NAME: name });
  const pool = createPool(config);
  return {
    pool,
    name,
    config,
    drop: async () => {
      await pool.end();
      const c = await mysql.createConnection(ADMIN);
      await c.query(`DROP DATABASE IF EXISTS \`${name}\``);
      await c.end();
    },
  };
}
