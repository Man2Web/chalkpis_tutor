/** Authoritative plan catalogue. The app shows these numbers but never decides them. */
export type PlanId = 'starter' | 'standard' | 'pro';
/** How often a plan is paid: every month or every year (a year costs about ten months). */
export type Cycle = 'month' | 'year';

export interface Plan {
  id: PlanId;
  name: string;
  /** Price per cycle, in paise. */
  prices: Record<Cycle, number>;
  studentLimit: number | null; // null = unlimited
  batchLimit: number | null;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    prices: { month: 19900, year: 199900 },
    studentLimit: 50,
    batchLimit: 3,
  },
  standard: {
    id: 'standard',
    name: 'Standard',
    prices: { month: 29900, year: 299900 },
    studentLimit: 100,
    batchLimit: 5,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    prices: { month: 49900, year: 499900 },
    studentLimit: null,
    batchLimit: null,
  },
};

export const CYCLE_MONTHS: Record<Cycle, number> = { month: 1, year: 12 };
/** The plan shown as "Most popular". */
export const POPULAR: PlanId = 'standard';
/**
 * The first month of a monthly plan for someone who never subscribed in the store apps (Apple's and Google's own
 * introductory offer, set up on the store products). Shown and charged by the store; the website has no intro price.
 */
export const INTRO_MONTH_PAISE = 4900;

/**
 * The packs sold until 2026-10 (one payment for 3, 6 or 12 months). Plans bought then run to their end on these
 * terms, and an order made then is still checked against its price.
 */
export const LEGACY: Record<PlanId, { pricePaise: number; months: number }> = {
  starter: { pricePaise: 39900, months: 3 },
  standard: { pricePaise: 69900, months: 6 },
  pro: { pricePaise: 99900, months: 12 },
};

export const isPlanId = (v: unknown): v is PlanId =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(PLANS, v);
export const isCycle = (v: unknown): v is Cycle => v === 'month' || v === 'year';

/** The price of one cycle of a plan; no cycle means a legacy pack. */
export const priceOf = (plan: PlanId, cycle: Cycle | null | undefined) =>
  cycle ? PLANS[plan].prices[cycle] : LEGACY[plan].pricePaise;
/** How many months one payment buys; no cycle means a legacy pack. */
export const monthsOf = (plan: PlanId, cycle: Cycle | null | undefined) =>
  cycle ? CYCLE_MONTHS[cycle] : LEGACY[plan].months;

/**
 * Store product ids: Apple `chalkpis.standard.monthly`; Google subscription `chalkpis.standard` with base plan
 * `monthly`, which RevenueCat writes as `chalkpis.standard:monthly`. Anything else is not ours and grants nothing.
 */
export function storeProduct(id: string): { plan: PlanId; cycle: Cycle } | null {
  const m = /^chalkpis\.(starter|standard|pro)[.:](monthly|yearly)$/.exec(id);
  return m ? { plan: m[1] as PlanId, cycle: m[2] === 'monthly' ? 'month' : 'year' } : null;
}

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
const dayValue = (plan: PlanId, cycle: Cycle | null | undefined) =>
  priceOf(plan, cycle) / (monthsOf(plan, cycle) * 30.4375);

type Prev = { status?: string; expiresAt?: Date; plan?: string; cycle?: Cycle | null } | undefined;

/**
 * New subscription after buying a plan for one cycle. Nobody loses days or money:
 * - ended or no plan: the plan starts now; during a free trial it starts when the trial ends (no free day is lost);
 * - the same plan while it runs (a renewal, monthly or yearly): its months are added after the current end;
 * - a higher plan while a lower one runs (an upgrade): the new plan starts now, and the unused days of the old one are
 *   credited at their value (a yearly day costs less than a monthly one, and an old pack's day less still);
 * - a lower plan while a higher one runs: buying it is refused up front (planChange), but if such a payment arrives
 *   anyway, the current plan stays and the payment's value is added to it as days.
 */
export function computeSubscription(
  prev: Prev,
  planId: PlanId,
  /** null: a legacy pack (an order made before monthly and yearly plans, paid after) */
  cycle: Cycle | null,
  now: Date,
) {
  const bought = PLANS[planId];
  const months = monthsOf(planId, cycle);
  const running =
    prev?.status === 'active' &&
    !!prev.expiresAt &&
    prev.expiresAt.getTime() > now.getTime() &&
    isPlanId(prev.plan);
  const result = (plan: Plan, c: Cycle | null, expiresAt: Date) => ({
    plan: plan.id,
    cycle: c,
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
    return result(bought, cycle, addMonths(trialEnd, months));
  }
  const current = PLANS[prev!.plan as PlanId];
  const currentCycle = prev!.cycle ?? null;
  const end = prev!.expiresAt!;
  if (current.id === bought.id) return result(bought, cycle, addMonths(end, months));
  if (PLAN_RANK[bought.id] > PLAN_RANK[current.id]) {
    const credit =
      ((end.getTime() - now.getTime()) * dayValue(current.id, currentCycle)) /
      dayValue(bought.id, cycle);
    return result(bought, cycle, new Date(addMonths(now, months).getTime() + Math.round(credit)));
  }
  const extra = (priceOf(bought.id, cycle) / dayValue(current.id, currentCycle)) * DAY;
  return result(current, currentCycle, new Date(end.getTime() + Math.round(extra)));
}

/** Whether a plan can be bought now: a lower plan waits until the running higher plan ends. */
export function planChange(
  prev: Prev,
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

/** The catalogue as the app and the website show it. */
export function catalogue() {
  return Object.values(PLANS).map((p) => ({
    id: p.id,
    name: p.name,
    prices: p.prices,
    studentLimit: p.studentLimit,
    batchLimit: p.batchLimit,
    popular: p.id === POPULAR,
  }));
}
