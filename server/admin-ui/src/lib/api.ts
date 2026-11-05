/** The admin session lives only in this browser tab (sessionStorage): closing the tab signs out of it here. */
const KEY = 'adm';

export type Role = 'super' | 'admin' | 'support';
export type Cap = 'view' | 'help' | 'money' | 'manage' | 'export' | 'delete' | 'team';
/** The signed-in team member: who, their role and what it allows (from /admin/auth/me, refreshed on every load). */
export type Session = { token: string; email?: string; name?: string; role?: Role; roleLabel?: string; caps?: Cap[] };

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

/** Reads who is signed in and what their role allows, and keeps it with the session. */
export async function loadMe(): Promise<Session | null> {
  const s = getSession();
  if (!s) return null;
  const me = await api<{ email: string; name: string; role: Role; roleLabel: string; caps: Cap[] }>('GET', '/admin/auth/me');
  const next = { ...s, ...me };
  saveSession(next);
  return next;
}
/** May the signed-in member do this? (The server checks again on every call.) */
export const can = (cap: Cap) => !!getSession()?.caps?.includes(cap);

/** Server reasons in plain words, for toasts and error boxes. */
const ERRORS: Record<string, string> = {
  not_allowed: 'Your role cannot do this. Ask the super admin.',
  signed_out: 'Your admin session ended. Please sign in again.',
  rate_limited: 'Too many tries. Wait a few minutes.',
  not_found: 'It is not there any more. Refresh the page.',
  bad_request: 'Something in the form is not right.',
  bad_date: 'That date is not right.',
  store_managed: 'This plan is paid through the App Store or Google Play. Add days instead, or change it in the store.',
  payment_provider_error: 'Razorpay did not answer. Try again in a minute.',
  billing_unavailable: 'Razorpay is not set up on this server.',
  cannot_retry: 'Too old to retry: its details are cleared after 7 days.',
  not_failed: 'This message did not fail.',
  invalid_code: 'That code is wrong.',
  code_expired: 'That code has expired or was already used. Ask for a new one.',
  email_unavailable: 'Email is not working right now, so no code could be sent.',
  cannot_delete: 'This cannot be deleted.',
  already_member: 'This email is already on the team.',
  already_super_admin: 'This email is the super admin already.',
  cannot_change_super_admin: 'The super admin is set on the server and cannot be changed here.',
  member_removed: 'This member was removed. Add them again instead.',
};
export function errorText(e: unknown): string {
  const err = e as ApiError;
  if (err?.code === 'cannot_delete' && typeof err.data?.message === 'string') return err.data.message;
  if (err?.code && ERRORS[err.code]) return ERRORS[err.code];
  if (err?.status === 403) return ERRORS.not_allowed;
  if (err?.status >= 500) return 'The server had a problem. Try again in a minute.';
  if (err instanceof TypeError) return 'No connection to the server. Check the internet and try again.';
  return err?.message || 'Something went wrong.';
}

// Calls that only read (even though they are POSTs) do not make the open pages reload.
const READ_ONLY = /\/(estimate|preview|test-push)$/;

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
  // a change was made: every open list and panel reloads, so nothing shows the old state
  if (method !== 'GET' && url.startsWith('/admin/api/') && !READ_ONLY.test(url))
    setTimeout(() => window.dispatchEvent(new Event('adm:refresh')), 0);
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
