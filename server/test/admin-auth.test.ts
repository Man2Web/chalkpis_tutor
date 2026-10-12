import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { passwordProblem, verifyPassword } from '../src/admin/auth.js';
import { MockMailer } from '../src/auth/mailer.js';
import { startHarness, TEST_ADMIN_EMAIL, type Harness } from './helpers.js';

const PASSWORD = 'Blue!Kite#River42';
const mailer = new MockMailer();
let h: Harness;
// each test comes from its own address, so the per-IP sign-in limits of one test do not spill into the next
let ip = 0;
const from = () => `198.51.100.${ip}`;
beforeAll(async () => {
  h = await startHarness({ OTP_DEV_ECHO: true }, { mailer });
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  mailer.sent = [];
  ip += 1;
  // the account row for every ADMIN_EMAILS address, as the server makes on start
  await h.db.pool.query('INSERT IGNORE INTO admin_accounts (id, email) VALUES (UUID(), ?)', [
    TEST_ADMIN_EMAIL,
  ]);
});

const post = (url: string, payload: unknown, token?: string) =>
  h.app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    remoteAddress: from(),
  });
const get = (url: string, token?: string) =>
  h.app.inject({
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    remoteAddress: from(),
  });
const later = (ms: number) => (h.clock.now = new Date(h.clock.now.getTime() + ms));

async function setPassword(password = PASSWORD) {
  later(61_000);
  const code = (await post('/admin/auth/forgot', { email: TEST_ADMIN_EMAIL })).json().devCode;
  return post('/admin/auth/reset', { email: TEST_ADMIN_EMAIL, code, password });
}
async function signIn(password = PASSWORD) {
  const step1 = await post('/admin/auth/login', { email: TEST_ADMIN_EMAIL, password });
  if (step1.statusCode !== 200) return { step1, token: null };
  const { challenge, devCode } = step1.json();
  const step2 = await post('/admin/auth/verify', {
    email: TEST_ADMIN_EMAIL,
    challenge,
    code: devCode,
  });
  return { step1, step2, token: step2.json().token as string | null };
}

describe('admin sign-in: email, password, then an emailed code', () => {
  it('a new admin sets the password with Forgot password, then signs in with password + code', async () => {
    // no password yet: refused like any wrong password
    expect((await signIn()).step1.statusCode).toBe(401);
    // a weak password is refused and does not use up the code
    later(61_000);
    const code = (await post('/admin/auth/forgot', { email: TEST_ADMIN_EMAIL })).json().devCode;
    const weak = await post('/admin/auth/reset', {
      email: TEST_ADMIN_EMAIL,
      code,
      password: 'short1!',
    });
    expect(weak.json().error).toBe('too_short');
    expect(
      (await post('/admin/auth/reset', { email: TEST_ADMIN_EMAIL, code, password: PASSWORD }))
        .statusCode,
    ).toBe(200);
    // the password is stored only as a salted, peppered scrypt hash
    const [[row]] = (await h.db.pool.query(
      'SELECT password_hash FROM admin_accounts',
    )) as unknown as [[{ password_hash: string }]];
    expect(row!.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(row!.password_hash).not.toContain(PASSWORD);
    expect(await verifyPassword('another-server-secret', row!.password_hash, PASSWORD)).toBe(false);

    const { step2, token } = await signIn();
    expect(step2!.statusCode).toBe(200);
    expect((await get('/admin/auth/me', token!)).json()).toEqual({ email: TEST_ADMIN_EMAIL });
    expect((await get('/admin/api/overview', token!)).statusCode).toBe(200);
    // codes arrive by email, never anywhere else
    expect(mailer.sent.map((m) => m.subject)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/password reset code/),
        expect.stringMatching(/admin sign-in code/),
        expect.stringMatching(/password was changed/),
      ]),
    );
    await post('/admin/auth/logout', {}, token!);
    expect((await get('/admin/api/overview', token!)).statusCode).toBe(401);
  });

  it('every wrong answer looks the same, whether or not the email is an admin', async () => {
    await setPassword();
    const wrong = await post('/admin/auth/login', {
      email: TEST_ADMIN_EMAIL,
      password: 'Wrong!Pass123',
    });
    const stranger = await post('/admin/auth/login', {
      email: 'someone@example.com',
      password: PASSWORD,
    });
    expect([wrong.statusCode, stranger.statusCode]).toEqual([401, 401]);
    expect(wrong.json()).toEqual(stranger.json());
    // forgot password answers the same too, and emails nobody who is not an admin
    mailer.sent = [];
    expect((await post('/admin/auth/forgot', { email: 'someone@example.com' })).json()).toEqual({
      ok: true,
    });
    expect(mailer.sent).toHaveLength(0);
  });

  it('five wrong passwords lock the account for 15 minutes and the admin is emailed', async () => {
    await setPassword();
    mailer.sent = [];
    for (let i = 0; i < 5; i++)
      await post('/admin/auth/login', { email: TEST_ADMIN_EMAIL, password: `Wrong!Pass12${i}` });
    expect(mailer.sent.map((m) => m.subject)).toEqual([
      'Chalkpis admin locked after wrong passwords',
    ]);
    // even the right password is refused while locked
    expect((await signIn()).step1.statusCode).toBe(401);
    later(16 * 60_000);
    expect((await signIn()).step2!.statusCode).toBe(200);
  });

  it('the code works only for the attempt that passed the password, once, for 10 minutes, 5 tries', async () => {
    await setPassword();
    const a = (
      await post('/admin/auth/login', { email: TEST_ADMIN_EMAIL, password: PASSWORD })
    ).json();
    // someone with the code but not the challenge from that attempt gets nothing
    const forged = await post('/admin/auth/verify', {
      email: TEST_ADMIN_EMAIL,
      challenge: 'x'.repeat(43),
      code: a.devCode,
    });
    expect(forged.statusCode).toBe(401);
    for (let i = 0; i < 5; i++)
      await post('/admin/auth/verify', {
        email: TEST_ADMIN_EMAIL,
        challenge: a.challenge,
        code: a.devCode === '000000' ? '111111' : '000000',
      });
    // out of tries: even the right code fails now
    expect(
      (
        await post('/admin/auth/verify', {
          email: TEST_ADMIN_EMAIL,
          challenge: a.challenge,
          code: a.devCode,
        })
      ).statusCode,
    ).toBe(401);
    // a new attempt, but the code expires after 10 minutes
    const b = (
      await post('/admin/auth/login', { email: TEST_ADMIN_EMAIL, password: PASSWORD })
    ).json();
    later(11 * 60_000);
    expect(
      (
        await post('/admin/auth/verify', {
          email: TEST_ADMIN_EMAIL,
          challenge: b.challenge,
          code: b.devCode,
        })
      ).statusCode,
    ).toBe(401);
  });

  it('a session ends after 30 idle minutes, after 8 hours, and on a password reset', async () => {
    await setPassword();
    const s1 = (await signIn()).token!;
    later(29 * 60_000);
    expect((await get('/admin/auth/me', s1)).statusCode).toBe(200); // activity keeps it alive
    later(31 * 60_000);
    expect((await get('/admin/auth/me', s1)).statusCode).toBe(401); // idle too long

    const s2 = (await signIn()).token!;
    for (let i = 0; i < 17; i++) {
      later(29 * 60_000);
      await get('/admin/auth/me', s2);
    }
    expect((await get('/admin/auth/me', s2)).statusCode).toBe(401); // past 8 hours

    const s3 = (await signIn()).token!;
    expect((await setPassword('An0ther!Strong#Pw')).statusCode).toBe(200);
    expect((await get('/admin/auth/me', s3)).statusCode).toBe(401);
    expect((await signIn()).step1.statusCode).toBe(401); // the old password is gone
    expect((await signIn('An0ther!Strong#Pw')).step2!.statusCode).toBe(200);
  });

  it('only ADMIN_EMAILS can be admins; tutor app tokens never reach the dashboard', async () => {
    const outsider = await h.admin('removed@example.com'); // a session for an address not in the setting
    expect((await outsider.call('GET', '/admin/api/overview')).status).toBe(401);
    const tutor = await h.tenant('+919876543210', { institute: 'Alpha' });
    expect((await tutor.call('GET', '/admin/api/overview')).status).toBe(401);
  });

  it('sign-ins, failures, lockouts and resets are in the audit log', async () => {
    await setPassword();
    await post('/admin/auth/login', { email: TEST_ADMIN_EMAIL, password: 'Wrong!Pass123' });
    await signIn();
    const [rows] = (await h.db.pool.query(
      'SELECT action FROM admin_audit WHERE admin_phone = ? ORDER BY created_at',
      [TEST_ADMIN_EMAIL],
    )) as unknown as [{ action: string }[]];
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining([
        'admin-reset-requested',
        'admin-password-reset',
        'admin-login-failed',
        'admin-login',
      ]),
    );
  });
});

describe('admin password rules', () => {
  it('needs 12+ characters with upper, lower, digit and symbol, not common, not the email', () => {
    expect(passwordProblem('Man2web@2026', 'hello@man2web.com')).toBeNull();
    expect(passwordProblem('Hello@2026xyz', 'hello@man2web.com')).toBe('contains_email');
    expect(passwordProblem('Blue!Kite#River42', 'hello@man2web.com')).toBeNull();
    expect(passwordProblem('Sh0rt!', 'a@b.com')).toBe('too_short');
    expect(passwordProblem('alllowercase12!', 'a@b.com')).toBe('needs_mix');
    expect(passwordProblem('Password1234!', 'a@b.com')).toBe('too_common');
  });
});
