import { useCallback, useState } from 'react';
import { useLimits } from './hooks';

export type GuardKind = 'student' | 'batch';
export type Block = { kind: GuardKind | 'expired'; limit?: number | null };

interface LimitInfo {
  studentLimit: number | null;
  batchLimit: number | null;
  activeStudentCount: number;
  batchCount: number;
  active: boolean;
}

/** Pure rule: null when the add is allowed, otherwise why it is blocked. */
export function limitBlock(l: LimitInfo | undefined, kind: GuardKind): Block | null {
  if (!l) return null; // not loaded yet: the server re-checks anyway
  if (!l.active) return { kind: 'expired' };
  if (kind === 'student' && l.studentLimit !== null && l.activeStudentCount >= l.studentLimit) {
    return { kind, limit: l.studentLimit };
  }
  if (kind === 'batch' && l.batchLimit !== null && l.batchCount >= l.batchLimit) {
    return { kind, limit: l.batchLimit };
  }
  return null;
}

/** Plan-limit check before an add. `check` returns true when allowed; otherwise opens the prompt. */
export function useAddGuard() {
  const limits = useLimits();
  const [blocked, setBlocked] = useState<Block | null>(null);

  const check = useCallback(
    (kind: GuardKind): boolean => {
      const b = limitBlock(limits.data, kind);
      setBlocked(b);
      return b === null;
    },
    [limits.data],
  );
  return { check, blocked, close: () => setBlocked(null), limits };
}
