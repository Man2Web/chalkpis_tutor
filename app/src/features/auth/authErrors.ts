/** Maps Firebase auth errors to translation keys under `auth.errors.*`. */
export type AuthErrorKey =
  'invalidPhone' | 'invalidCode' | 'codeExpired' | 'tooMany' | 'network' | 'generic';

export function authErrorKey(e: unknown): AuthErrorKey {
  switch ((e as { code?: string })?.code) {
    case 'auth/invalid-phone-number':
      return 'invalidPhone';
    case 'auth/invalid-verification-code':
      return 'invalidCode';
    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'codeExpired';
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return 'tooMany';
    case 'auth/network-request-failed':
      return 'network';
    default:
      return 'generic';
  }
}
