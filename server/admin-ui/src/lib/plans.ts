import { money } from '@/lib/format';
import type { Tone } from '@/lib/names';

// ---------- the plan catalogue (the server's billing/plans.ts is the authority) ----------

export type PlanKey = 'trial' | 'starter' | 'standard' | 'pro';
export type Cycle = 'month' | 'year';
/** Prices in paise per month and per year (a year costs about ten months). */
export const PLAN_INFO: Record<PlanKey, { name: string; prices: Record<Cycle, number>; students: number | null; batches: number | null }> = {
  trial: { name: 'Free trial', prices: { month: 0, year: 0 }, students: null, batches: null },
  starter: { name: 'Starter', prices: { month: 19900, year: 199900 }, students: 50, batches: 3 },
  standard: { name: 'Standard', prices: { month: 29900, year: 299900 }, students: 100, batches: 5 },
  pro: { name: 'Pro', prices: { month: 49900, year: 499900 }, students: null, batches: null },
};
export const PLAN_KEYS = Object.keys(PLAN_INFO) as PlanKey[];
export const isPlan = (p?: string | null): p is PlanKey => !!p && p in PLAN_INFO;
export const planName = (p?: string | null) => (isPlan(p) ? PLAN_INFO[p].name : p ? p[0]!.toUpperCase() + p.slice(1) : 'No plan');
export const cycleName = (c?: string | null) => (c === 'year' ? 'Yearly' : c === 'month' ? 'Monthly' : '');
/** "₹2,999 / year"; a plan set by an admin or bought as an old pack has no cycle. */
export const planPrice = (p?: string | null, cycle?: string | null) =>
  !isPlan(p) || p === 'trial'
    ? 'No charge'
    : cycle === 'year' || cycle === 'month'
      ? `${money(PLAN_INFO[p].prices[cycle])} / ${cycle}`
      : `${money(PLAN_INFO[p].prices.month)} / month or ${money(PLAN_INFO[p].prices.year)} / year`;
export const limitText = (n: number | null | undefined) => (n == null ? 'Unlimited' : String(n));

export const DAY = 86_400_000;

// ---------- where a subscription stands, in words anyone understands ----------

export type SubFacts = { plan?: string | null; planActive?: boolean; expiresAt?: string | null };
export type SubState = { key: 'none' | 'trial' | 'active' | 'ending' | 'ended'; label: string; tone: Tone; daysLeft: number | null };

export function subscriptionState(s: SubFacts, now = Date.now()): SubState {
  if (!s.plan) return { key: 'none', label: 'No plan', tone: 'neutral', daysLeft: null };
  const end = s.expiresAt ? Date.parse(s.expiresAt) : 0;
  if (!s.planActive || end <= now) return { key: 'ended', label: 'Ended', tone: 'red', daysLeft: 0 };
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY));
  if (daysLeft <= 7) return { key: 'ending', label: daysLeft <= 1 ? 'Ends today' : `Ends in ${daysLeft} days`, tone: 'orange', daysLeft };
  if (s.plan === 'trial') return { key: 'trial', label: 'Trial', tone: 'blue', daysLeft };
  return { key: 'active', label: 'Active', tone: 'green', daysLeft };
}

/** "Paid via Razorpay", "App Store", "Cash · recorded by admin"… */
const GATEWAY: Record<string, string> = {
  razorpay: 'Razorpay',
  cashfree: 'Cashfree',
  phonepe: 'PhonePe',
  apple: 'App Store',
  google: 'Google Play',
  mock: 'Test payment',
};
export const STORE_NAME: Record<string, string> = { app_store: 'App Store', play_store: 'Google Play' };
export const METHOD: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', other: 'Other' };
export const paidVia = (provider: string, method?: string | null) =>
  provider === 'manual' ? `${METHOD[method ?? ''] ?? 'Offline'} · recorded by admin` : (GATEWAY[provider] ?? provider);

