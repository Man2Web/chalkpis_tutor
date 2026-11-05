import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = {
  DB_USER: 'app',
  DB_PASSWORD: 'a-long-random-secret',
  DB_NAME: 'tutordesk',
  JWT_SECRET: 'q8Zr4mVt1xLp9nWc3JhB7yKd5sGfA2eU',
  OTP_PEPPER: 'Hk6vP0tQz8RmXb3NcY1wJ4LdS7gF9aEu',
};

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
  it('treats blank optional settings as not set instead of refusing to start', () => {
    const c = loadConfig({
      ...base,
      WA_CLIENT_ID: '',
      WA_CLIENT_PASSWORD: '  ',
      RAZORPAY_KEY_ID: '',
      PUBLIC_BASE_URL: '',
    });
    expect([c.WA_CLIENT_ID, c.WA_CLIENT_PASSWORD, c.RAZORPAY_KEY_ID, c.PUBLIC_BASE_URL]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
  it('reads the trial length, with a safe default and range', () => {
    expect(loadConfig(base).TRIAL_DAYS).toBe(7);
    expect(loadConfig({ ...base, TRIAL_DAYS: '90' }).TRIAL_DAYS).toBe(90);
    for (const bad of ['0', '-1', '5000', 'x'])
      expect(() => loadConfig({ ...base, TRIAL_DAYS: bad })).toThrow(/TRIAL_DAYS/);
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
  it('needs long signing secrets, and refuses obvious placeholders in production', () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ ...base, OTP_PEPPER: undefined })).toThrow(/OTP_PEPPER/);
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40) }),
    ).toThrow(/placeholder/);
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        OTP_PEPPER: 'please-change-this-secret-value-now!',
      }),
    ).toThrow(/placeholder/);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).not.toThrow();
  });
  it('WhatsApp settings are optional, but validated when given', () => {
    expect(loadConfig(base)).toMatchObject({ WA_API_METHOD: 'POST', OTP_DEV_ECHO: false });
    expect(() => loadConfig({ ...base, WA_API_URL: 'not a url' })).toThrow(/WA_API_URL/);
    expect(() => loadConfig({ ...base, WA_FROM: '+91 63840' })).toThrow(/WA_FROM/);
    expect(
      loadConfig({
        ...base,
        WA_API_URL: 'https://gw.example/send',
        WA_FROM: '916384009225',
        WA_TEMPLATE_OTP: '28941160978828267',
      }).WA_TEMPLATE_OTP,
    ).toBe('28941160978828267');
  });
  it('never echoes the password in an error message', () => {
    try {
      loadConfig({ ...base, DB_PASSWORD: 'super-secret-value', PORT: 'nope' });
    } catch (e) {
      expect((e as Error).message).not.toContain('super-secret-value');
    }
  });
});
