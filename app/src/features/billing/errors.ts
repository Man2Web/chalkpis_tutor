export type BillingError = 'not-configured' | 'failed';

/** Maps a callable failure to something the screen can explain. */
export function billingError(e: unknown): BillingError {
  const code = (e as { code?: string; message?: string })?.code ?? '';
  const msg = (e as { message?: string })?.message ?? '';
  return code.includes('failed-precondition') || msg.includes('billing-not-configured')
    ? 'not-configured'
    : 'failed';
}
