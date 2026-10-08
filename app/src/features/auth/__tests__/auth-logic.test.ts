import { authErrorKey } from '../authErrors';
import { statusFor } from '../status';
import type { UserProfile } from '../../../lib/types';

const profile = (p: Partial<UserProfile>): UserProfile => ({
  name: 'A',
  phone: '+91',
  language: 'en',
  role: 'owner',
  ...p,
});

describe('authErrorKey', () => {
  it.each([
    ['auth/invalid-phone-number', 'invalidPhone'],
    ['auth/invalid-verification-code', 'invalidCode'],
    ['auth/code-expired', 'codeExpired'],
    ['auth/session-expired', 'codeExpired'],
    ['auth/too-many-requests', 'tooMany'],
    ['auth/network-request-failed', 'network'],
    ['auth/something-else', 'generic'],
  ])('%s -> %s', (code, key) => expect(authErrorKey({ code })).toBe(key));
  it('handles non-errors', () => {
    expect(authErrorKey(undefined)).toBe('generic');
    expect(authErrorKey('boom')).toBe('generic');
  });
});

describe('statusFor', () => {
  it('signed out without a uid', () => expect(statusFor(null, null, false)).toBe('signedOut'));
  it('loading until the profile arrives', () =>
    expect(statusFor('u', null, false)).toBe('loading'));
  it('onboarding when there is no profile or institute yet', () => {
    expect(statusFor('u', null, true)).toBe('needsOnboarding');
    expect(statusFor('u', profile({}), true)).toBe('needsOnboarding');
  });
  it('stays in onboarding after the institute exists until it is finished', () => {
    expect(statusFor('u', profile({ instituteId: 'I' }), true)).toBe('needsOnboarding');
  });
  it('ready only when institute exists and onboarding is done', () => {
    expect(statusFor('u', profile({ instituteId: 'I', onboardingDone: true }), true)).toBe('ready');
  });
});
