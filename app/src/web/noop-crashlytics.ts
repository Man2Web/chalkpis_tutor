// Crashlytics is native-only; in the browser preview errors go to the console.
export const getCrashlytics = () => ({});
export const recordError = (_c: unknown, error: unknown) => console.error(error);
export const log = () => undefined;
export const setUserId = () => Promise.resolve();
