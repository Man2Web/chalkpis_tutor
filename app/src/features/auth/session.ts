import { useEffect } from 'react';
import { create } from 'zustand';
import { api, ApiError, setSignedOutHandler } from '../../api/client';
import { tokens } from '../../api/tokens';
import { reportError } from '../../lib/analytics';
import type { UserProfile } from '../../lib/types';
import { statusFor, type SessionStatus } from './status';

interface SessionState {
  status: SessionStatus;
  uid: string | null;
  profile: UserProfile | null;
  set: (s: Partial<SessionState>) => void;
}

export const useSession = create<SessionState>((set) => ({
  status: 'loading',
  uid: null,
  profile: null,
  set,
}));

/** True for a helper (staff) account: attendance only. */
export const useIsStaff = () => useSession((s) => s.profile?.role === 'staff');

/** What GET /me answers. */
export interface MeResponse {
  user: { id: string; phone: string; name: string; language: 'en' | 'hi' };
  membership: { instituteId: string; role: 'owner' | 'staff'; onboardingDone: boolean } | null;
}

/** Puts the signed-in person into the app state; which part of the app shows follows from it. */
export function applyMe(me: MeResponse) {
  const profile: UserProfile = {
    name: me.user.name,
    phone: me.user.phone,
    language: me.user.language,
    role: me.membership?.role ?? 'owner',
    ...(me.membership
      ? { instituteId: me.membership.instituteId, onboardingDone: me.membership.onboardingDone }
      : {}),
  };
  useSession
    .getState()
    .set({ uid: me.user.id, profile, status: statusFor(me.user.id, profile, true) });
}

/** Re-reads the profile (after setting up the institute, finishing onboarding, or editing the profile). */
export async function refreshProfile() {
  applyMe(await api<MeResponse>('GET', '/me'));
}

const signedOut = () =>
  useSession.getState().set({ uid: null, profile: null, status: 'signedOut' });

/** Mount once at the root: restores the saved sign-in, and signs out everywhere when the server ends the session. */
export function useSessionBootstrap() {
  useEffect(() => {
    setSignedOutHandler(signedOut);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const restore = async () => {
      if (!(await tokens.getRefresh())) return signedOut();
      try {
        const me = await api<MeResponse>('GET', '/me');
        if (alive) applyMe(me);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) return signedOut();
        // No network or the server is busy: stay on the splash and try again shortly instead of showing a login screen.
        if (!(e instanceof ApiError && e.status === 0)) reportError(e);
        timer = setTimeout(() => void restore(), 4000);
      }
    };
    void restore();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
}

export async function logout() {
  const refreshToken = await tokens.getRefresh();
  try {
    if (refreshToken) await api('POST', '/auth/logout', { refreshToken });
  } catch {
    // the server forgets the session on its own; signing out locally is what matters
  }
  await tokens.clear();
  signedOut();
}
