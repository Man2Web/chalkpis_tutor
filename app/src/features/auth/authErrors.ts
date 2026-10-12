import { ApiError } from '../../api/client';

/** Maps a failed call to a translation key under `auth.errors.*`. */
export type AuthErrorKey =
  | 'invalidPhone'
  | 'invalidCode'
  | 'codeExpired'
  | 'tooMany'
  | 'blocked'
  | 'unavailable'
  | 'network'
  | 'phoneInUse'
  | 'phoneAlreadySet'
  | 'generic';

export function authErrorKey(e: unknown): AuthErrorKey {
  if (!(e instanceof ApiError)) return 'generic';
  if (e.status === 0) return 'network';
  switch (e.code) {
    case 'invalid_phone':
      return 'invalidPhone';
    case 'account_blocked':
      return 'blocked';
    case 'otp_unavailable':
      return 'unavailable';
    case 'invalid_code':
      return 'invalidCode'; // wrong, expired, used and never-sent codes all look the same on purpose
    // adding a mobile number to a signed-in account
    case 'phone_in_use':
      return 'phoneInUse';
    case 'phone_already_set':
      return 'phoneAlreadySet';
    case 'too_soon':
    case 'too_many':
    case 'rate_limited':
      return 'tooMany';
    default:
      // any other limit (the server's general limiter answers {error: 'Too Many Requests'})
      return e.status === 429 ? 'tooMany' : 'generic';
  }
}

/** Seconds until another code may be sent, when the server refused one because the last was too recent. */
export function resendWaitOf(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.code !== 'too_soon') return null;
  const s = e.extra.retryAfter;
  return typeof s === 'number' && s > 0 ? Math.ceil(s) : null;
}
