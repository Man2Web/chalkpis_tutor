import { ApiError } from '../../api/client';

/** Maps a failed call to a translation key under `auth.errors.*`. */
export type AuthErrorKey =
  'invalidPhone' | 'invalidCode' | 'codeExpired' | 'tooMany' | 'network' | 'generic';

export function authErrorKey(e: unknown): AuthErrorKey {
  if (!(e instanceof ApiError)) return 'generic';
  if (e.status === 0) return 'network';
  switch (e.code) {
    case 'invalid_phone':
      return 'invalidPhone';
    case 'invalid_code':
      return 'invalidCode'; // wrong, expired, used and never-sent codes all look the same on purpose
    case 'too_soon':
    case 'too_many':
    case 'rate_limited':
      return 'tooMany';
    default:
      return 'generic';
  }
}
