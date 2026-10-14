import { api, type ApiOptions } from '../../api/client';
import type { Cycle, PlanId } from './plans';
export { billingError, type BillingError } from './errors';

export interface PlanLink {
  url: string;
  referenceId: string;
  /** `gateway` = a real checkout page (Razorpay); `mock` = local test mode. */
  provider: 'gateway' | 'mock';
}

/** Asks the server for a payment link (web app only); the price is decided there, not here. */
export async function createPlanLink(
  planId: PlanId,
  cycle: Cycle,
  opts?: ApiOptions,
): Promise<PlanLink> {
  const r = await api<{ orderId: string; url: string }>(
    'POST',
    '/billing/links',
    { planId, cycle },
    opts,
  );
  return {
    url: r.url,
    referenceId: r.orderId,
    provider: r.url.startsWith('mock://') ? 'mock' : 'gateway',
  };
}

/** Test mode only: marks the payment as paid. The server has no such route in production. */
export async function mockCompletePayment(referenceId: string): Promise<void> {
  await api('POST', '/billing/mock/complete', { orderId: referenceId });
}

/** Where a plan order stands. The server confirms it with the payment gateway itself before saying 'paid'. */
export async function checkPlanOrder(referenceId: string): Promise<'paid' | 'pending' | 'failed'> {
  const r = await api<{ state: 'paid' | 'pending' | 'failed' }>(
    'GET',
    `/billing/orders/${referenceId}`,
  );
  return r.state;
}

/**
 * After a store purchase or "Restore purchases": the server reads the centre's subscription from the store (through
 * RevenueCat) and switches the plan on. Says whether a store subscription now decides the plan.
 */
export async function syncStorePlan(): Promise<{ state: 'store' | 'left' | 'none' | 'missing' }> {
  return api('POST', '/billing/store/sync');
}
