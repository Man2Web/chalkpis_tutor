import { api } from '../../api/client';
import type { PlanId } from './plans';
export { billingError, type BillingError } from './errors';

export interface PlanLink {
  url: string;
  referenceId: string;
  provider: 'razorpay' | 'mock';
}

/** Asks the server for a payment link; the price is decided there, not here. */
export async function createPlanLink(planId: PlanId): Promise<PlanLink> {
  const r = await api<{ orderId: string; url: string }>('POST', '/billing/links', { planId });
  return {
    url: r.url,
    referenceId: r.orderId,
    provider: r.url.startsWith('mock://') ? 'mock' : 'razorpay',
  };
}

/** Test mode only: marks the payment as paid. The server has no such route in production. */
export async function mockCompletePayment(referenceId: string): Promise<void> {
  await api('POST', '/billing/mock/complete', { orderId: referenceId });
}
