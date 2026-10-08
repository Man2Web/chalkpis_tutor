import { Platform } from 'react-native';
import { tokens } from './tokens';

/** The server. On the Android emulator the laptop is 10.0.2.2; in a browser preview it is localhost. Production sets EXPO_PUBLIC_API_URL. */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:8787' : 'http://127.0.0.1:8787')
).replace(/\/$/, '');

/** A failed call. `code` is the server's short reason (e.g. plan_expired, plan_limit, exceeds_balance); status 0 = no network. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

let onSignedOut: () => void = () => undefined;
/** The session store registers here so a dead refresh token signs the person out everywhere. */
export const setSignedOutHandler = (fn: () => void) => {
  onSignedOut = fn;
};

type Init = { method: string; headers?: Record<string, string>; body?: BodyInit | null };

async function send(path: string, init: Init, access: string | null) {
  try {
    return await fetch(API_URL + path, {
      ...init,
      headers: { ...(access ? { Authorization: `Bearer ${access}` } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'network');
  }
}

let refreshing: Promise<boolean> | null = null;

/** Swaps the refresh token for new tokens. One refresh at a time: the server rotates tokens, so two at once would look like theft. */
function refresh(): Promise<boolean> {
  return (refreshing ??= (async () => {
    try {
      const rt = await tokens.getRefresh();
      if (!rt) return false;
      const res = await send(
        '/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        },
        null,
      );
      if (res.status === 401) {
        await tokens.clear();
        return false;
      }
      if (!res.ok) return false; // server trouble: keep the tokens, try again later
      const j = (await res.json()) as { accessToken: string; refreshToken: string };
      await tokens.save(j.accessToken, j.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })());
}

async function call(path: string, init: Init): Promise<Response> {
  let res = await send(path, init, await tokens.getAccess());
  if (res.status === 401 && (await tokens.getRefresh())) {
    if (await refresh()) res = await send(path, init, await tokens.getAccess());
    else if (!(await tokens.getRefresh())) onSignedOut();
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }
  if (!res.ok) {
    const { error, ...extra } = (body ?? {}) as { error?: string };
    throw new ApiError(res.status, error ?? 'unknown', extra);
  }
  return body as T;
}

/** JSON request with sign-in, automatic refresh and one retry. */
export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  return parse<T>(
    await call(path, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    }),
  );
}

/** Calls that must work without being signed in (login). */
export async function apiPublic<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return parse<T>(
    await send(
      path,
      {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
      },
      null,
    ),
  );
}

/** Uploads a picture (a file the phone picked) as the raw body, which is how the server takes logos and photos. */
export async function uploadImage<T = unknown>(path: string, uri: string): Promise<T> {
  const blob = await (await fetch(uri)).blob();
  const type = ['image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/jpeg';
  return parse<T>(
    await call(path, { method: 'PUT', headers: { 'Content-Type': type }, body: blob }),
  );
}

/** An image address the server owns: relative paths get the server address and the sign-in header (student photos are private). */
export function imageSource(uri: string): { uri: string; headers?: Record<string, string> } {
  if (!uri.startsWith('/')) return { uri };
  const access = tokens.peekAccess();
  return {
    uri: API_URL + uri,
    ...(access ? { headers: { Authorization: `Bearer ${access}` } } : {}),
  };
}
