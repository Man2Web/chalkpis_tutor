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

const IST_OFFSET = 5.5 * 3_600_000;

/**
 * Calendar months on the IST calendar, clamped to month end (31 Jan + 1 month = 28 Feb). Counted in IST because
 * 1 Mar at 3 am IST is still 28 Feb in UTC, and clamping that would end the plan days early.
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime() + IST_OFFSET);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return new Date(d.getTime() - IST_OFFSET);
}

/** Higher is more: an upgrade is a move to a higher rank. */
export const PLAN_RANK: Record<PlanId, number> = { starter: 1, standard: 2, pro: 3 };
const DAY = 86_400_000;
/** What one day of a plan is worth, in paise (a month counted as 30.4375 days). */
const dayValue = (p: Plan) => p.pricePaise / (p.months * 30.4375);

/**
 * New subscription after buying a plan. Nobody loses days or money:
 * - ended or no plan: the plan starts now; during a free trial it starts when the trial ends (no free day is lost);
 * - the same plan while it runs (a renewal): its months are added after the current end;
 * - a higher plan while a lower one runs (an upgrade): the new plan starts now, and the unused days of the old one are
 *   credited at their value (longer plans cost less a month, so a Starter day is worth about 1.6 Pro days);
 * - a lower plan while a higher one runs: buying it is refused up front (planChange), but if such a payment arrives
 *   anyway, the current plan stays and the payment's value is added to it as days.
 */
export function computeSubscription(
  prev: { status?: string; expiresAt?: Date; plan?: string } | undefined,
  planId: PlanId,
  now: Date,
) {
  const bought = PLANS[planId];
  const running =
    prev?.status === 'active' &&
    !!prev.expiresAt &&
    prev.expiresAt.getTime() > now.getTime() &&
    isPlanId(prev.plan);
  const result = (plan: Plan, expiresAt: Date) => ({
    plan: plan.id,
    startsAt: now,
    expiresAt,
    studentLimit: plan.studentLimit,
    batchLimit: plan.batchLimit,
  });
  if (!running) {
    const trialEnd =
      prev?.status === 'active' && prev.plan === 'trial' && prev.expiresAt && prev.expiresAt > now
        ? prev.expiresAt
        : now;
    return result(bought, addMonths(trialEnd, bought.months));
  }
  const current = PLANS[prev!.plan as PlanId];
  const end = prev!.expiresAt!;
  if (current.id === bought.id) return result(bought, addMonths(end, bought.months));
  if (PLAN_RANK[bought.id] > PLAN_RANK[current.id]) {
    const credit = ((end.getTime() - now.getTime()) * dayValue(current)) / dayValue(bought);
    return result(bought, new Date(addMonths(now, bought.months).getTime() + Math.round(credit)));
  }
  const extra = (bought.pricePaise / dayValue(current)) * DAY;
  return result(current, new Date(end.getTime() + Math.round(extra)));
}

/** Whether a plan can be bought now: a lower plan waits until the running higher plan ends. */
export function planChange(
  prev: { status?: string; expiresAt?: Date; plan?: string } | undefined,
  planId: PlanId,
  now: Date,
): { ok: true; kind: 'new' | 'renew' | 'upgrade' } | { ok: false; until: Date } {
  const running =
    prev?.status === 'active' &&
    !!prev.expiresAt &&
    prev.expiresAt.getTime() > now.getTime() &&
    isPlanId(prev.plan);
  if (!running) return { ok: true, kind: 'new' };
  const current = prev!.plan as PlanId;
  if (current === planId) return { ok: true, kind: 'renew' };
  if (PLAN_RANK[planId] > PLAN_RANK[current]) return { ok: true, kind: 'upgrade' };
  return { ok: false, until: prev!.expiresAt! };
}
