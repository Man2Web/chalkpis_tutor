import { Linking, Platform } from 'react-native';
import Purchases, {
  INTRO_ELIGIBILITY_STATUS,
  PURCHASES_ERROR_CODE,
  STORE_REPLACEMENT_MODE,
  type PurchasesPackage,
} from 'react-native-purchases';
import { PLAN_RANK, storeProduct } from '../features/billing/plans';
import type { BuyResult, StoreOffer } from './purchases';

export type { BuyResult, StoreOffer } from './purchases';

/**
 * In-app subscriptions on iPhone and Android, through RevenueCat. The buyer is the centre: RevenueCat's app user id is
 * the institute id, so the server can read what the centre has and switch its plan on. Only owners get here.
 */

let user: string | null = null;
const packages = new Map<string, PurchasesPackage>();

export const storeAvailable = true;

/** Starts the store SDK for this centre (the public key comes from the server), or switches it to another centre. */
export async function startStore(apiKey: string, appUserId: string): Promise<void> {
  if (user === appUserId) return;
  if (!(await Purchases.isConfigured())) Purchases.configure({ apiKey, appUserID: appUserId });
  else await Purchases.logIn(appUserId);
  user = appUserId;
}

/** Our plans as the store sells them now, with the store's prices and the intro price for those who can get it. */
export async function storeOffers(): Promise<StoreOffer[]> {
  const offerings = await Purchases.getOfferings();
  const pkgs = offerings.current?.availablePackages ?? [];
  packages.clear();
  const out: StoreOffer[] = [];
  for (const pkg of pkgs) {
    const p = storeProduct(pkg.product.identifier);
    if (!p) continue;
    packages.set(pkg.product.identifier, pkg);
    out.push({
      productId: pkg.product.identifier,
      ...p,
      price: pkg.product.priceString,
      amount: pkg.product.price,
      currency: pkg.product.currencyCode,
      intro: null,
    });
  }
  if (Platform.OS === 'ios') {
    // Apple shows the intro price to everyone; only someone who never subscribed in this group can get it
    const ids = out
      .filter((o) => packages.get(o.productId)?.product.introPrice)
      .map((o) => o.productId);
    if (ids.length) {
      const eligible = await Purchases.checkTrialOrIntroductoryPriceEligibility(ids).catch(
        () => ({}) as Record<string, { status: INTRO_ELIGIBILITY_STATUS }>,
      );
      for (const o of out)
        if (
          eligible[o.productId]?.status ===
          INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
        )
          o.intro = packages.get(o.productId)!.product.introPrice!.priceString;
    }
  } else {
    // Google offers only what this person can still get, in the default option
    for (const o of out) {
      const phase = packages.get(o.productId)?.product.defaultOption?.introPhase;
      if (phase) o.intro = phase.price.formatted;
    }
  }
  return out;
}

/**
 * Opens the store's purchase sheet. On Google Play a change from the centre's current subscription replaces it: a
 * higher plan (or yearly) now, with the unused time credited; a lower plan when the current one renews. Apple decides
 * that itself within the subscription group.
 */
export async function buyOffer(offer: StoreOffer, current: string | null): Promise<BuyResult> {
  const pkg = packages.get(offer.productId);
  if (!pkg) throw new Error('store_product_missing');
  let change = null;
  const cur = current ? storeProduct(current) : null;
  if (Platform.OS === 'android' && current && cur && current !== offer.productId) {
    const up =
      PLAN_RANK[offer.plan] > PLAN_RANK[cur.plan] ||
      (offer.plan === cur.plan && offer.cycle === 'year');
    change = {
      oldProductIdentifier: current.split(':')[0]!,
      replacementMode: up
        ? STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION
        : STORE_REPLACEMENT_MODE.DEFERRED,
    };
  }
  try {
    await Purchases.purchasePackage(pkg, null, change);
    return 'done';
  } catch (e) {
    const err = e as { code?: string; userCancelled?: boolean | null };
    if (err.userCancelled || err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
      return 'cancelled';
    if (err.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return 'pending';
    throw e;
  }
}

/** "Restore purchases": tells RevenueCat about this phone's store purchases (Apple requires the button). */
export async function restoreStore(): Promise<void> {
  await Purchases.restorePurchases();
}

/** The store's own page to change or cancel the subscription. */
export async function manageStore(): Promise<void> {
  if (Platform.OS === 'ios') return Purchases.showManageSubscriptions();
  const info = await Purchases.getCustomerInfo().catch(() => null);
  await Linking.openURL(
    info?.managementURL ?? 'https://play.google.com/store/account/subscriptions',
  );
}

/** On sign-out: the next person on this phone must not act as this centre. */
export async function endStore(): Promise<void> {
  if (!user) return;
  user = null;
  if (await Purchases.isConfigured()) await Purchases.logOut().catch(() => undefined);
}
