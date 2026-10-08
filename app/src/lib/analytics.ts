/** Product events. Never pass phone numbers, names or amounts. */
export type AppEvent = 'onboarding_completed' | 'attendance_saved' | 'payment_recorded';

/** No analytics service is connected yet; events are only counted in development so the call sites stay in place. */
export function track(event: AppEvent) {
  if (__DEV__) console.warn('[event]', event);
}

/** Errors are logged in development. A crash-reporting service can be plugged in here later without touching any screen. */
export function reportError(error: unknown) {
  if (__DEV__) console.warn('[error]', error instanceof Error ? error.message : String(error));
}
