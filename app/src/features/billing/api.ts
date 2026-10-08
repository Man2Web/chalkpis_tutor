import { httpsCallable } from '@react-native-firebase/functions';
import { functions } from '../../lib/firebase';
import type { PlanId } from './plans';
export { billingError, type BillingError } from './errors';

export interface PlanLink {
  url: string;
  referenceId: string;
  provider: 'razorpay' | 'mock';
}

/** Asks the server for a payment link; the price is decided there, not here. */
export async function createPlanLink(planId: PlanId): Promise<PlanLink> {
  const { data } = await httpsCallable<{ planId: PlanId }, PlanLink>(
    functions,
    'createPlanLink',
  )({ planId });
  return data;
}

/** Test mode only (emulator): marks the payment as paid. The server refuses this in production. */
export async function mockCompletePayment(referenceId: string): Promise<void> {
  await httpsCallable(functions, 'mockCompletePayment')({ referenceId });
}
