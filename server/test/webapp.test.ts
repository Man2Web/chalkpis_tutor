import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { webAppRoutes } from '../src/routes/webapp.js';
import { startHarness, type Harness } from './helpers.js';

// a small stand-in for what `npm run web:build` exports
const SCRIPT = `console.log(${JSON.stringify('chalkpis '.repeat(500))});`;
let dir: string;
let app: FastifyInstance;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'webapp-'));
  await fs.mkdir(path.join(dir, '_expo/static/js/web'), { recursive: true });
  await fs.mkdir(path.join(dir, 'assets/node_modules/@expo-google-fonts/inter/400Regular'), {
    recursive: true,
  });
  await fs.writeFile(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  await fs.writeFile(path.join(dir, '_expo/static/js/web/index-abc123.js'), SCRIPT);
  await fs.writeFile(
    path.join(dir, 'assets/node_modules/@expo-google-fonts/inter/400Regular/Inter.abc.ttf'),
    'font',
  );
  await fs.writeFile(path.join(dir, 'manifest.webmanifest'), '{"name":"ChalkPis"}');
  await fs.writeFile(path.join(dir, 'secret.txt'), 'not served');
  await fs.writeFile(path.join(os.tmpdir(), 'outside.js'), 'not served');
  app = Fastify();
  webAppRoutes(app, dir);
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the browser version of the app at /app', () => {
  it('serves the page at /app, /app/ and any path without a file extension, never cached', async () => {
    for (const url of ['/app', '/app/', '/app/students/42']) {
      const r = await app.inject({ url });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('text/html');
      expect(r.headers['cache-control']).toBe('no-cache');
      expect(r.headers['content-security-policy']).toContain("script-src 'self'");
      expect(r.headers['content-security-policy']).toContain("connect-src 'self'");
      expect(r.body).toContain('<div id="root">');
    }
  });

  it('caches the hashed build files for a year and compresses the script', async () => {
    const plain = await app.inject({ url: '/app/_expo/static/js/web/index-abc123.js' });
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['content-type']).toContain('text/javascript');
    expect(plain.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body).toBe(SCRIPT);

    const brotli = await app.inject({
      url: '/app/_expo/static/js/web/index-abc123.js',
      headers: { 'accept-encoding': 'gzip, deflate, br' },
    });
    expect(brotli.headers['content-encoding']).toBe('br');
    expect(brotli.headers.vary).toBe('Accept-Encoding');
    expect(brotliDecompressSync(brotli.rawPayload).toString()).toBe(SCRIPT);
    expect(brotli.rawPayload.length).toBeLessThan(SCRIPT.length / 10);

    const gz = await app.inject({
      url: '/app/_expo/static/js/web/index-abc123.js',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.rawPayload).toString()).toBe(SCRIPT);

    const font = await app.inject({
      url: '/app/assets/node_modules/@expo-google-fonts/inter/400Regular/Inter.abc.ttf',
      headers: { 'accept-encoding': 'br' },
    });
    expect(font.statusCode).toBe(200);
    expect(font.headers['content-type']).toBe('font/ttf');
    expect(font.headers['content-encoding']).toBeUndefined();
    expect(font.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const manifest = await app.inject({ url: '/app/manifest.webmanifest' });
    expect(manifest.headers['content-type']).toContain('application/manifest+json');
    expect(manifest.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('serves nothing outside the app folder, and no other kinds of file', async () => {
    for (const url of [
      '/app/secret.txt',
      '/app/..%2Foutside.js',
      '/app/%2E%2E/outside.js',
      '/app/_expo/static/js/web/missing.js',
    ])
      expect((await app.inject({ url })).statusCode).toBe(404);
  });
});

describe('the server', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await startHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  it('serves the exported web app at /app', async () => {
    const r = await h.app.inject({ url: '/app/' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('/app/manifest.webmanifest');
    expect(r.body).toMatch(/\/app\/_expo\/static\/js\/web\/index-[0-9a-f]+\.js/);
  });
});
