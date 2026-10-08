import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { DB_USER: 'app', DB_PASSWORD: 'a-long-random-secret', DB_NAME: 'tutordesk' };

describe('loadConfig', () => {
  it('fills safe defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      NODE_ENV: 'development',
      PORT: 8080,
      DB_HOST: '127.0.0.1',
      DB_PORT: 3306,
      DB_POOL_SIZE: 10,
      DB_SSL: false,
      AUTO_MIGRATE: true,
      TRUST_PROXY: false,
      LOG_LEVEL: 'info',
    });
  });
  it('reads numbers and true/false flags from text', () => {
    const c = loadConfig({
      ...base,
      PORT: '9000',
      DB_PORT: '3307',
      DB_SSL: 'true',
      AUTO_MIGRATE: 'false',
      TRUST_PROXY: 'true',
    });
    expect(c).toMatchObject({
      PORT: 9000,
      DB_PORT: 3307,
      DB_SSL: true,
      AUTO_MIGRATE: false,
      TRUST_PROXY: true,
    });
  });
  it('stops with a clear message listing every problem', () => {
    expect(() => loadConfig({ DB_NAME: 'x' })).toThrow(/DB_USER[\s\S]*DB_PASSWORD/);
  });
  it.each([
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', 'abc'],
    ['DB_POOL_SIZE', '500'],
    ['AUTO_MIGRATE', 'yes'],
    ['NODE_ENV', 'staging'],
  ])('rejects %s=%s', (k, v) =>
    expect(() => loadConfig({ ...base, [k]: v })).toThrow(/Invalid configuration/),
  );
  it('rejects database names that could break out of a query', () => {
    for (const name of ['a;DROP DATABASE x', 'a`b', 'a b', '', 'x'.repeat(65)])
      expect(() => loadConfig({ ...base, DB_NAME: name })).toThrow(/DB_NAME/);
  });
  it('refuses a placeholder database password in production only', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', DB_PASSWORD: 'changeme' })).toThrow(
      /placeholder/,
    );
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'development', DB_PASSWORD: 'changeme' }),
    ).not.toThrow();
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).not.toThrow();
  });
  it('never echoes the password in an error message', () => {
    try {
      loadConfig({ ...base, DB_PASSWORD: 'super-secret-value', PORT: 'nope' });
    } catch (e) {
      expect((e as Error).message).not.toContain('super-secret-value');
    }
  });
});
