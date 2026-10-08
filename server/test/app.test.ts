import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createPool } from '../src/db.js';
import { createTestDb, testConfig, type TestDb } from './db.js';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});

describe('health', () => {
  it('liveness answers without needing the database', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    const res = await app.inject('/health/live');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('readiness is ok when the database answers', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    const res = await app.inject('/health');
    expect([res.statusCode, res.json()]).toEqual([200, { status: 'ok', db: 'up' }]);
    await app.close();
  });

  it('readiness is 503 when the database is unreachable, and says nothing about why', async () => {
    const dead = createPool({ ...db.config, DB_PORT: 1, DB_PASSWORD: 'secret-password' });
    const app = await buildApp({ config: db.config, pool: dead });
    const res = await app.inject('/health');
    expect(res.statusCode).toBe(503);
    expect(res.body).toBe('{"status":"unavailable"}');
    await app.close();
    await dead.end();
  });
});

describe('safe defaults', () => {
  it('sends security headers and does not advertise the framework', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    const h = (await app.inject('/health/live')).headers;
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['content-security-policy']).toContain("default-src 'none'");
    expect(h['x-frame-options']).toBeDefined();
    expect(h['strict-transport-security']).toBeDefined();
    expect(h['x-powered-by']).toBeUndefined();
    await app.close();
  });

  it('unknown paths get a plain JSON 404', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    const res = await app.inject('/nope');
    expect([res.statusCode, res.json()]).toEqual([404, { error: 'not_found' }]);
    await app.close();
  });

  it('unexpected errors answer 500 without leaking details', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    app.get('/boom', async () => {
      throw new Error('secret internals: password=hunter2');
    });
    const res = await app.inject('/boom');
    expect([res.statusCode, res.json()]).toEqual([500, { error: 'internal' }]);
    expect(res.body).not.toContain('hunter2');
    await app.close();
  });

  it('a malformed JSON body is a 400, not a crash', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    app.post('/echo', async (req) => req.body);
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });
    expect([res.statusCode, res.json()]).toEqual([400, { error: 'bad_request' }]);
    await app.close();
  });

  it('refuses oversized bodies', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    app.post('/echo', async (req) => req.body);
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'a'.repeat(1_200_000) }),
    });
    expect(res.statusCode).toBe(413 as number);
    await app.close();
  });

  it('rate-limits a flood from one address', async () => {
    const app = await buildApp({ config: db.config, pool: db.pool });
    const codes: number[] = [];
    for (let i = 0; i < 310; i++) codes.push((await app.inject('/health/live')).statusCode);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes.slice(0, 300).every((c) => c === 200)).toBe(true);
    await app.close();
  });
});

describe('logging', () => {
  it('never writes phone numbers, query strings or parent-link tokens', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const app = await buildApp({
      config: testConfig({ ...db.config, LOG_LEVEL: 'info' }),
      pool: db.pool,
      logStream: stream,
    });
    const token = 'RKT9CTQtaF5ijtyHkcYTqU6KiWXVkVymPXsICww39wg';
    await app.inject({
      url: `/p/${token}?phone=919876543210&code=123456`,
      headers: { authorization: 'Bearer sekret-token', cookie: 'sid=abc' },
    });
    await app.inject({ url: '/api/lookup?phone=%2B919876543210' });
    await app.close();
    const all = lines.join('');
    expect(all).toContain('/p/[hidden]');
    for (const secret of [token, '919876543210', '123456', 'sekret-token', 'sid=abc'])
      expect(all).not.toContain(secret);
  });
});
