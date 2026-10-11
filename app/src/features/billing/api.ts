import { api } from '../../api/client';
import type { PlanId } from './plans';
export { billingError, type BillingError } from './errors';

export interface PlanLink {
  url: string;
  referenceId: string;
  /** `gateway` = a real checkout page (PhonePe); `mock` = local test mode. */
  provider: 'gateway' | 'mock';
}

/** Asks the server for a payment link; the price is decided there, not here. */
export async function createPlanLink(planId: PlanId): Promise<PlanLink> {
  const r = await api<{ orderId: string; url: string }>('POST', '/billing/links', { planId });
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
