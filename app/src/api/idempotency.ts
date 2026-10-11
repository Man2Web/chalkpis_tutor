import { useCallback, useState } from 'react';
import { ApiError } from './client';

/**
 * A fresh Idempotency-Key (16–100 of [A-Za-z0-9_-]). No native crypto needed: the server keeps keys per person for
 * 24 hours, so a timestamp plus random parts is plenty to never clash. Always at least 24 characters.
 */
export function newIdempotencyKey(): string {
  const rnd = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `${Date.now().toString(36)}-${rnd()}${rnd()}${rnd()}`;
}

/** True when a failed request may or may not have been done (no answer, or server trouble): retry with the same key. */
export function outcomeUnknown(e: unknown): boolean {
  return (
    e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.code === 'request_in_progress')
  );
}

/**
 * One key per user action (saving this payment, adding this student). The key stays the same across retries of
 * that action, so a lost answer followed by "Save" again cannot record it twice. Call `reset` after success (the
 * next action is a new one); `settle(error)` after a failure keeps the key only when the outcome is unknown, because
 * the server replays a definite error (e.g. "more than the balance") for the same key even after the form is fixed.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(newIdempotencyKey);
  const reset = useCallback(() => setKey(newIdempotencyKey()), []);
  const settle = useCallback(
    (e: unknown) => {
      if (!outcomeUnknown(e)) reset();
    },
    [reset],
  );
  return { key, reset, settle };
}
