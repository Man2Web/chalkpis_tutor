import { rupeesPerDay, storeProduct } from '../plans';
import {
  planAction,
  storeAction,
  subscriptionState,
  usageFraction,
  usageLevel,
  type SubInput,
} from '../logic';

const NOW = Date.parse('2026-10-08T06:00:00Z');
const day = 86_400_000;
const sub = (over: Partial<SubInput> = {}): SubInput => ({
  plan: 'starter',
  status: 'active',
  expiresAtMs: NOW + 30 * day,
  studentLimit: 50,
  batchLimit: 3,
  ...over,
});

describe('store products and prices (the same rule as server/src/billing/plans.ts)', () => {
  it('reads Apple and Google product ids, and nothing else', () => {
    expect(storeProduct('chalkpis.standard.monthly')).toEqual({ plan: 'standard', cycle: 'month' });
    expect(storeProduct('chalkpis.pro:yearly')).toEqual({ plan: 'pro', cycle: 'year' });
    for (const bad of ['chalkpis.gold.monthly', 'pro.yearly', 'chalkpis.pro.weekly'])
      expect(storeProduct(bad)).toBeNull();
  });
  it('a price as so much a day', () => {
    expect(rupeesPerDay(299900, 'year')).toBe(8);
    expect(rupeesPerDay(199900, 'year')).toBe(5);
    expect(rupeesPerDay(29900, 'month')).toBe(10);
  });
  it('the store button: the current subscription, a switch, or a new one', () => {
    expect(storeAction(null, 'chalkpis.pro.yearly')).toBe('subscribe');
    expect(storeAction('chalkpis.pro.yearly', 'chalkpis.pro.yearly')).toBe('current');
    expect(storeAction('chalkpis.starter.monthly', 'chalkpis.pro.yearly')).toBe('switch');
  });
});

describe('subscriptionState', () => {
  it('a healthy paid plan: no banner, days rounded up', () => {
    expect(subscriptionState(sub(), NOW)).toEqual({ expired: false, daysLeft: 30, banner: null });
    expect(
      subscriptionState(sub({ expiresAtMs: NOW + 23 * 3_600_000 + 60_000 }), NOW).daysLeft,
    ).toBe(1);
  });
  it('warns in the last 3 days (paid) or last 3 days of the trial', () => {
    expect(subscriptionState(sub({ expiresAtMs: NOW + 3 * day }), NOW).banner).toBe('expiringSoon');
    expect(subscriptionState(sub({ expiresAtMs: NOW + 4 * day }), NOW).banner).toBeNull();
    expect(subscriptionState(sub({ plan: 'trial', expiresAtMs: NOW + 2 * day }), NOW).banner).toBe(
      'trialEnding',
    );
  });
  it('shows a gentle trial note while the trial runs', () => {
    expect(subscriptionState(sub({ plan: 'trial', expiresAtMs: NOW + 6 * day }), NOW)).toEqual({
      expired: false,
      daysLeft: 6,
      banner: 'trial',
    });
  });
  it('expired by status or by date, whichever comes first', () => {
    expect(subscriptionState(sub({ status: 'expired' }), NOW)).toEqual({
      expired: true,
      daysLeft: 0,
      banner: 'expired',
    });
    expect(subscriptionState(sub({ expiresAtMs: NOW - 1 }), NOW).expired).toBe(true);
    expect(subscriptionState(sub({ expiresAtMs: NOW }), NOW).expired).toBe(true);
  });
});

describe('usage meters', () => {
  it('fraction is capped and unlimited is empty', () => {
    expect(usageFraction(25, 50)).toBe(0.5);
    expect(usageFraction(60, 50)).toBe(1);
    expect(usageFraction(500, null)).toBe(0);
    expect(usageFraction(0, 0)).toBe(0);
  });
  it('levels: ok, near at 80%, full at the limit', () => {
    expect(usageLevel(10, 50)).toBe('ok');
    expect(usageLevel(40, 50)).toBe('near');
    expect(usageLevel(39, 50)).toBe('ok');
    expect(usageLevel(50, 50)).toBe('full');
    expect(usageLevel(51, 50)).toBe('full');
    expect(usageLevel(9999, null)).toBe('ok');
  });
});

describe('planAction', () => {
  it('renew the current active plan, otherwise choose', () => {
    expect(planAction({ plan: 'starter', expired: false }, 'starter')).toBe('renew');
    expect(planAction({ plan: 'starter', expired: false }, 'pro')).toBe('choose');
    expect(planAction({ plan: 'starter', expired: true }, 'starter')).toBe('choose');
    expect(planAction({ plan: 'trial', expired: false }, 'starter')).toBe('choose');
  });
});
