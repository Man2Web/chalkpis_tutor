export interface SubInput {
  plan: string; // trial | starter | standard | pro
  status: string; // active | expired
  expiresAtMs: number;
  studentLimit: number | null;
  batchLimit: number | null;
}

export type BannerKind = 'expired' | 'expiringSoon' | 'trialEnding' | 'trial' | null;

export interface SubState {
  expired: boolean;
  daysLeft: number; // 0 when expired
  banner: BannerKind;
}

const DAY = 86_400_000;

/** Whole days left, rounded up (23 hours left is still "1 day"). An ended plan is expired whatever its status says. */
export function subscriptionState(sub: SubInput, nowMs: number): SubState {
  const expired = sub.status !== 'active' || sub.expiresAtMs <= nowMs;
  const daysLeft = expired ? 0 : Math.ceil((sub.expiresAtMs - nowMs) / DAY);
  let banner: BannerKind = null;
  if (expired) banner = 'expired';
  else if (daysLeft <= 3) banner = sub.plan === 'trial' ? 'trialEnding' : 'expiringSoon';
  else if (sub.plan === 'trial') banner = 'trial';
  return { expired, daysLeft, banner };
}

/** 0..1 for a progress bar; unlimited plans show an empty bar (the label says Unlimited). */
export function usageFraction(used: number, limit: number | null): number {
  if (limit === null || limit <= 0) return 0;
  return Math.min(1, used / limit);
}

export type UsageLevel = 'ok' | 'near' | 'full';

/** Colour the meter: near at 80%, full at 100%. Unlimited is always ok. */
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return 'ok';
  if (used >= limit) return 'full';
  return used / limit >= 0.8 ? 'near' : 'ok';
}

/** What the button on a plan card says. */
export function planAction(
  current: { plan: string; expired: boolean },
  planId: string,
): 'renew' | 'choose' {
  return !current.expired && current.plan === planId ? 'renew' : 'choose';
}
