/** Authoritative plan catalogue. The app shows these numbers but never decides them. */
export type PlanId = 'starter' | 'standard' | 'pro';

export interface Plan {
  id: PlanId;
  name: string;
  pricePaise: number;
  months: number;
  studentLimit: number | null; // null = unlimited
  batchLimit: number | null;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    pricePaise: 39900,
    months: 3,
    studentLimit: 50,
    batchLimit: 3,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    pricePaise: 69900,
    months: 6,
    studentLimit: 100,
    batchLimit: 5,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    pricePaise: 99900,
    months: 12,
    studentLimit: null,
    batchLimit: null,
  },
};

export const isPlanId = (v: unknown): v is PlanId =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(PLANS, v);

/** Calendar months, clamped to month end (31 Jan + 1 month = 28 Feb). UTC so servers agree. */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * New subscription after buying a plan. Renewing while still active adds the months on top of the remaining
 * time (nobody loses days); an expired or trial-ended plan starts counting from now.
 */
export function computeSubscription(
  prev: { status?: string; expiresAt?: Date } | undefined,
  planId: PlanId,
  now: Date,
) {
  const plan = PLANS[planId];
  const stillActive =
    prev?.status === 'active' && prev.expiresAt && prev.expiresAt.getTime() > now.getTime();
  const base = stillActive ? (prev!.expiresAt as Date) : now;
  return {
    plan: plan.id,
    startsAt: now,
    expiresAt: addMonths(base, plan.months),
    studentLimit: plan.studentLimit,
    batchLimit: plan.batchLimit,
  };
}
