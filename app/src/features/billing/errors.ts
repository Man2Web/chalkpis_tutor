export type BillingError = 'not-configured' | 'failed';

/** Maps a failed call to something the screen can explain (the server says billing_unavailable when no payment provider is set up). */
export function billingError(e: unknown): BillingError {
  const code = (e as { code?: string })?.code ?? '';
  return code === 'billing_unavailable' ? 'not-configured' : 'failed';
}
