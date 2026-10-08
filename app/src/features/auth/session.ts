import { doc, onSnapshot } from '@react-native-firebase/firestore';
import { onAuthStateChanged, signOut } from '@react-native-firebase/auth';
import { useEffect } from 'react';
import { create } from 'zustand';
import { auth, db } from '../../lib/firebase';
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

/** Mount once at the root: follows the signed-in user and their profile document. */
export function useSessionBootstrap() {
  const set = useSession((s) => s.set);
  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.();
      unsubProfile = undefined;
      if (!user) {
        set({ uid: null, profile: null, status: 'signedOut' });
        return;
      }
      set({ uid: user.uid, status: 'loading' });
      unsubProfile = onSnapshot(
        doc(db, 'users', user.uid),
        (snap) => {
          const profile = snap.exists() ? (snap.data() as UserProfile) : null;
          set({ uid: user.uid, profile, status: statusFor(user.uid, profile, true) });
        },
        (e) => reportError(e),
      );
    });
    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, [set]);
}

export const logout = () => signOut(auth);
