import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import type { Identity } from './identity.js';

export type OAuthProviderName = 'google' | 'apple';

/**
 * One "sign in with ..." provider, using the authorization-code flow on our server: the app opens {start}, the
 * provider sends the person back to our callback with a code, and we exchange it for an ID token whose signature,
 * issuer, audience, expiry and nonce we check before trusting anything in it.
 */
export interface OAuthProvider {
  name: OAuthProviderName;
  authorizeUrl(a: { state: string; nonce: string; redirectUri: string }): string;
  /** Code -> verified identity. `extra` is what the provider posts besides the code (Apple sends the name once). */
  exchange(a: {
    code: string;
    nonce: string;
    redirectUri: string;
    extra?: Record<string, string>;
  }): Promise<Identity>;
}

type Fetch = typeof fetch;

export class GoogleProvider implements OAuthProvider {
  name = 'google' as const;
  private keys: JWTVerifyGetKey;
  constructor(
    private clientId: string,
    private clientSecret: string,
    private fetchFn: Fetch = fetch,
    keys?: JWTVerifyGetKey,
  ) {
    this.keys = keys ?? createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  }
  authorizeUrl({
    state,
    nonce,
    redirectUri,
  }: {
    state: string;
    nonce: string;
    redirectUri: string;
  }) {
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  async exchange({
    code,
    nonce,
    redirectUri,
  }: {
    code: string;
    nonce: string;
    redirectUri: string;
  }) {
    const res = await this.fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
    if (!res.ok) throw new Error(`google-token-${res.status}`);
    const { id_token } = (await res.json()) as { id_token?: string };
    if (!id_token) throw new Error('google-no-id-token');
    const { payload } = await jwtVerify(id_token, this.keys, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: this.clientId,
    });
    if (payload.nonce !== nonce || typeof payload.sub !== 'string')
      throw new Error('google-bad-token');
    return {
      provider: 'google',
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
    } satisfies Identity;
  }
}

export class AppleProvider implements OAuthProvider {
  name = 'apple' as const;
  private keys: JWTVerifyGetKey;
  constructor(
    private opts: { servicesId: string; teamId: string; keyId: string; privateKey: string },
    private fetchFn: Fetch = fetch,
    keys?: JWTVerifyGetKey,
    private nowMs: () => number = Date.now,
  ) {
    this.keys = keys ?? createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  }
  authorizeUrl({
    state,
    nonce,
    redirectUri,
  }: {
    state: string;
    nonce: string;
    redirectUri: string;
  }) {
    const q = new URLSearchParams({
      client_id: this.opts.servicesId,
      redirect_uri: redirectUri,
      response_type: 'code',
      // asking for name or email makes Apple post the answer back to us instead of using a redirect
      response_mode: 'form_post',
      scope: 'name email',
      state,
      nonce,
    });
    return `https://appleid.apple.com/auth/authorize?${q}`;
  }
  /** True when the .p8 key can sign; checked once at startup. */
  async keyWorks() {
    try {
      await this.clientSecret();
      return true;
    } catch {
      return false;
    }
  }
  /** Apple's "client secret" is a short JWT we sign with the .p8 key (ES256). */
  private async clientSecret() {
    const key = await importPKCS8(normalizePem(this.opts.privateKey), 'ES256');
    const iat = Math.floor(this.nowMs() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.opts.keyId })
      .setIssuer(this.opts.teamId)
      .setSubject(this.opts.servicesId)
      .setAudience('https://appleid.apple.com')
      .setIssuedAt(iat)
      .setExpirationTime(iat + 300)
      .sign(key);
  }
  async exchange({
    code,
    nonce,
    redirectUri,
    extra,
  }: {
    code: string;
    nonce: string;
    redirectUri: string;
    extra?: Record<string, string>;
  }) {
    const res = await this.fetchFn('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.opts.servicesId,
        client_secret: await this.clientSecret(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    if (!res.ok) throw new Error(`apple-token-${res.status}`);
    const { id_token } = (await res.json()) as { id_token?: string };
    if (!id_token) throw new Error('apple-no-id-token');
    const { payload } = await jwtVerify(id_token, this.keys, {
      issuer: 'https://appleid.apple.com',
      audience: this.opts.servicesId,
    });
    if (payload.nonce !== nonce || typeof payload.sub !== 'string')
      throw new Error('apple-bad-token');
    // Apple sends the name only on the very first sign-in, outside the token.
    let name: string | null = null;
    try {
      const u = extra?.user
        ? (JSON.parse(extra.user) as { name?: { firstName?: string; lastName?: string } })
        : null;
      name = [u?.name?.firstName, u?.name?.lastName].filter(Boolean).join(' ') || null;
    } catch {
      name = null;
    }
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    return {
      provider: 'apple',
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: verified,
      name,
    } satisfies Identity;
  }
}

/**
 * The .p8 text however it was pasted (real newlines, "\n", spaces, wrapping quotes) back into a clean PEM:
 * environment-variable boxes often mangle multi-line values.
 */
export function normalizePem(raw: string) {
  const body = pemBody(raw);
  return `-----BEGIN PRIVATE KEY-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
}

/** Just the base64 of the key: escaped newlines (even double-escaped), quotes and stray characters dropped. */
export const pemBody = (raw: string) =>
  raw
    .replace(/\\+n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/[^A-Za-z0-9+/=]/g, '');

// ---------- native Sign in with Apple (iPhone) ----------

/** Checks the identity token the iPhone's own Apple sheet returns. */
export interface AppleNativeVerifier {
  verify(identityToken: string, nonce: string): Promise<Identity>;
}

/**
 * The token is signed by Apple, issued for our app's bundle id, unexpired, and carries the one-time nonce our
 * server handed out (Apple may put it in as given or as its SHA-256, so both are accepted).
 */
export class AppleNative implements AppleNativeVerifier {
  private keys: JWTVerifyGetKey;
  constructor(
    private bundleId: string,
    keys?: JWTVerifyGetKey,
    private nowMs: () => number = Date.now,
  ) {
    this.keys = keys ?? createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  }
  async verify(identityToken: string, nonce: string): Promise<Identity> {
    const { payload } = await jwtVerify(identityToken, this.keys, {
      issuer: 'https://appleid.apple.com',
      audience: this.bundleId,
      currentDate: new Date(this.nowMs()),
    });
    const hashed = createHash('sha256').update(nonce).digest('hex');
    if ((payload.nonce !== nonce && payload.nonce !== hashed) || typeof payload.sub !== 'string')
      throw new Error('apple-native-bad-token');
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    return {
      provider: 'apple',
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: verified,
      name: null,
    };
  }
}

// ---------- state: what the start step hands to the callback, signed so nobody can forge it ----------

export interface OAuthState {
  provider: OAuthProviderName;
  redirect: string;
  nonce: string;
  /** SHA-256 of a secret only the app holds; the ticket is redeemed only with that secret. */
  bind: string;
}

const secretKey = (secret: string) => new TextEncoder().encode(`oauth-state:${secret}`);

export async function signState(secret: string, s: OAuthState, nowMs: number) {
  const iat = Math.floor(nowMs / 1000);
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(iat + 600) // ten minutes to finish signing in
    .sign(secretKey(secret));
}

export async function readState(
  secret: string,
  token: unknown,
  nowMs: number,
): Promise<OAuthState | null> {
  if (typeof token !== 'string' || token.length > 2000) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), {
      algorithms: ['HS256'],
      currentDate: new Date(nowMs),
    });
    const { provider, redirect, nonce, bind } = payload as unknown as OAuthState;
    if (
      (provider !== 'google' && provider !== 'apple') ||
      typeof redirect !== 'string' ||
      typeof nonce !== 'string' ||
      typeof bind !== 'string'
    )
      return null;
    return { provider, redirect, nonce, bind };
  } catch {
    return null;
  }
}

export const newNonce = () => randomBytes(16).toString('base64url');

/** The secret the app keeps for one sign-in, and its hash that travels inside the state. */
export function newBinding() {
  const secret = randomBytes(32).toString('base64url');
  return { secret, bind: bindingOf(secret) };
}
export const bindingOf = (secret: string) =>
  createHash('sha256').update(secret).digest('base64url');

/**
 * Where a sign-in may be sent: the app's own scheme. `exp://` (Expo Go during development) is accepted only
 * outside production, where anyone could point it at their own computer and collect the ticket.
 */
export function redirectPrefixes(prefixes: string[], nodeEnv: string) {
  return nodeEnv === 'production' ? prefixes.filter((x) => !x.startsWith('exp://')) : prefixes;
}

/** Only the app (and, in development, configured web origins) may receive a sign-in. */
export const allowedRedirect = (redirect: unknown, prefixes: string[]): redirect is string =>
  typeof redirect === 'string' &&
  redirect.length <= 300 &&
  prefixes.some((p) => redirect.startsWith(p));
