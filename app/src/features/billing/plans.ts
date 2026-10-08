/**
 * What the app shows for each plan. The server (functions/src/lib/plans.ts) is the authority on price and
 * limits; a test on each side pins the same numbers so they cannot drift apart unnoticed.
 */
export type PlanId = 'starter' | 'standard' | 'pro';

export interface PlanInfo {
  id: PlanId;
  pricePaise: number;
  months: number;
  studentLimit: number | null; // null = unlimited
  batchLimit: number | null;
}

export const PLANS: PlanInfo[] = [
  { id: 'starter', pricePaise: 39900, months: 3, studentLimit: 50, batchLimit: 3 },
  { id: 'standard', pricePaise: 69900, months: 6, studentLimit: 100, batchLimit: 5 },
  { id: 'pro', pricePaise: 99900, months: 12, studentLimit: null, batchLimit: null },
];
