/** The admin session lives only in this browser tab (sessionStorage): closing the tab signs out of it here. */
const KEY = 'adm';

export type Session = { token: string; email?: string };

export function getSession(): Session | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Session | null;
    return t?.token ? t : null;
  } catch {
    return null;
  }
}
export function saveSession(s: Session) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}
export function clearSession() {
  sessionStorage.removeItem(KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: Record<string, unknown>;
  constructor(status: number, code?: string, data?: Record<string, unknown>) {
    super(code ?? `Error ${status}`);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

/** Called when the server says the admin session has ended (idle 30 minutes or 8 hours). */
let onExpired: () => void = () => undefined;
export function setOnExpired(fn: () => void) {
  onExpired = fn;
}

export async function api<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  const s = getSession();
  const res = await fetch(url, {
    method,
    headers: {
      'X-Client-Platform': 'web',
      // JSON header only with a body: the server refuses a request that announces JSON and sends none
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && s) {
    clearSession();
    onExpired();
    throw new ApiError(401, 'signed_out');
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, (data.error as string) ?? undefined, data);
  return data as T;
}

/** Downloads a CSV export with the session token and saves it under `name`. */
export async function downloadCsv(url: string, name: string) {
  const s = getSession();
  const res = await fetch(url, {
    headers: { 'X-Client-Platform': 'web', ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
  });
  if (res.status === 401 && s) {
    clearSession();
    onExpired();
    throw new ApiError(401, 'signed_out');
  }
  if (!res.ok) throw new ApiError(res.status);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
