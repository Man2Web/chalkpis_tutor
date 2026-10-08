import type { UserProfile } from '../../lib/types';

export type SessionStatus = 'loading' | 'signedOut' | 'needsOnboarding' | 'ready';

/** Which part of the app to show. Onboarding must be finished explicitly (onboardingDone). */
export function statusFor(
  uid: string | null,
  profile: UserProfile | null,
  profileLoaded: boolean,
): SessionStatus {
  if (!uid) return 'signedOut';
  if (!profileLoaded) return 'loading';
  return profile?.instituteId && profile.onboardingDone ? 'ready' : 'needsOnboarding';
}
