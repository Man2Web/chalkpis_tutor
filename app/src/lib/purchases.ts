import type { Cycle, PlanId } from '../features/billing/plans';

/**
 * In-app subscriptions (App Store / Google Play through RevenueCat). This file is the web build's stand-in: the browser
 * pays on the website instead, so here there is no store. The phones use purchases.native.ts.
 */

/** One plan as the store sells it, with the store's own price text. */
export interface StoreOffer {
  productId: string;
  plan: PlanId;
  cycle: Cycle;
  /** The store's price, e.g. "₹2,999.00". */
  price: string;
  /** The same as a number, in `currency` units (2999), for the "₹8 a day" line. */
  amount: number;
  currency: string;
  /** The first-month price this person can still get (Apple's / Google's intro offer), e.g. "₹49.00". */
  intro: string | null;
}

/** done: bought (the server is then asked to sync); cancelled: closed the store sheet; pending: awaiting the bank. */
export type BuyResult = 'done' | 'cancelled' | 'pending';

export const storeAvailable = false;
export async function startStore(_apiKey: string, _appUserId: string): Promise<void> {}
export async function storeOffers(): Promise<StoreOffer[]> {
  return [];
}
export async function buyOffer(_offer: StoreOffer, _current: string | null): Promise<BuyResult> {
  throw new Error('store_unavailable');
}
export async function restoreStore(): Promise<void> {}
export async function manageStore(): Promise<void> {}
export async function endStore(): Promise<void> {}
