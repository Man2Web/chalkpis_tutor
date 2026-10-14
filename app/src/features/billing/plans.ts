/**
 * Plans as the app shows them. The server (server/src/billing/plans.ts) is the authority: the catalogue, prices and
 * limits come from GET /billing/plans, and in the iPhone and Android apps the price shown is the store's own.
 */
export type PlanId = 'starter' | 'standard' | 'pro';
/** Paid every month or every year. */
export type Cycle = 'month' | 'year';

export interface PlanInfo {
  id: PlanId;
  name: string;
  /** Price per cycle on the website, in paise. */
  prices: Record<Cycle, number>;
  studentLimit: number | null; // null = unlimited
  batchLimit: number | null;
  popular: boolean;
}

export const PLAN_RANK: Record<PlanId, number> = { starter: 1, standard: 2, pro: 3 };

/**
 * Store product ids: Apple `chalkpis.standard.monthly`, Google `chalkpis.standard:monthly` (subscription plus base
 * plan). The same rule as the server's; anything else is not one of our plans.
 */
export function storeProduct(id: string): { plan: PlanId; cycle: Cycle } | null {
  const m = /^chalkpis\.(starter|standard|pro)[.:](monthly|yearly)$/.exec(id);
  return m ? { plan: m[1] as PlanId, cycle: m[2] === 'monthly' ? 'month' : 'year' } : null;
}

/** What a plan costs a day, in whole rupees, for the "just ₹8 a day" line. */
export const rupeesPerDay = (paise: number, cycle: Cycle) =>
  Math.max(1, Math.round(paise / 100 / (cycle === 'year' ? 365 : 30.4375)));
