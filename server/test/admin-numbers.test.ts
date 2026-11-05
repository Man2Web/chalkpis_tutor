import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminText } from '../src/admin/crm.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

/**
 * The admin dashboard's money numbers agree with each other: the cards on Overview, Subscriptions, Payments and Revenue
 * (GET /admin/api/billing, /admin/api/overview) count exactly the centres the Subscriptions list shows under the same
 * name (GET /admin/api/institutes, filtered the way Subscriptions.tsx filters it).
 */

const DAY = 86_400_000;
let h: Harness;
let admin: Tenant;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  admin = await h.admin();
});

const pay = (t: Tenant, amountPaise = 299900) =>
  admin.call('POST', `/admin/api/institutes/${t.instituteId}/plan-payments`, {
    planId: 'standard',
    cycle: 'year',
    amountPaise,
    method: 'upi',
    apply: true,
  });
const endsIn = (t: Tenant, days: number) =>
  h.db.pool.query('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [
    new Date(h.clock.now.getTime() + days * DAY),
    t.instituteId,
  ]);
/** Auto-renew approved on the website (Razorpay); `authenticated` = approved, first charge still to come. */
const webAutoRenew = (t: Tenant, status: 'active' | 'authenticated') =>
  h.db.pool.query(
    "INSERT INTO web_subscriptions (id, institute_id, plan_id, cycle, amount, rp_plan_id, status) VALUES (?, ?, 'standard', 'year', 299900, 'plan_test', ?)",
    [`sub_${t.instituteId.slice(0, 12)}`, t.instituteId, status],
  );

type Row = {
  id: string;
  plan: string | null;
  planActive: boolean;
  expiresAt: string | null;
  paidNow: boolean;
  givenByAdmin: boolean;
  renews: boolean;
};
/** The same rules as admin-ui lib/plans.ts subscriptionState and pages/Subscriptions.tsx. */
function views(rows: Row[], now: number) {
  const state = (c: Row) => {
    if (!c.plan) return 'none';
    const end = c.expiresAt ? Date.parse(c.expiresAt) : 0;
    if (!c.planActive || end <= now) return 'ended';
    return Math.ceil((end - now) / DAY) <= 7 ? 'ending' : 'active';
  };
  const ids = (f: (c: Row) => boolean) => rows.filter(f).map((c) => c.id).sort();
  return {
    paying: ids((c) => ['active', 'ending'].includes(state(c)) && c.plan !== 'trial' && c.paidNow),
    granted: ids((c) => c.givenByAdmin),
    trial: ids((c) => c.plan === 'trial' && state(c) !== 'ended'),
    ending: ids((c) => state(c) === 'ending' && !c.renews),
    endingRenewing: ids((c) => state(c) === 'ending' && c.renews),
    ended: ids((c) => state(c) === 'ended'),
  };
}

describe('admin numbers agree between the cards and the lists', () => {
  it('counts paying, given by an admin, trials, ending soon and auto-renew the same everywhere', async () => {
    const P = await h.tenant('+919800000001', { institute: 'Paid Yearly' });
    const E = await h.tenant('+919800000002', { institute: 'Paid Ending' });
    const R = await h.tenant('+919800000003', { institute: 'Paid Renewing' });
    const G = await h.tenant('+919800000004', { institute: 'Given Free' });
    const T1 = await h.tenant('+919800000005', { institute: 'Trial Ending' });
    const T2 = await h.tenant('+919800000006', { institute: 'Trial Autorenew' });
    for (const t of [P, E, R]) expect((await pay(t)).status).toBe(201);
    await endsIn(E, 3);
    await endsIn(R, 3);
    await webAutoRenew(R, 'active');
    // an admin gives a plan: no money, so not paying and not in MRR
    await admin.call('POST', `/admin/api/institutes/${G.instituteId}/plan`, { plan: 'standard', days: 30 });
    await endsIn(T1, 5);
    await endsIn(T2, 2);
    await webAutoRenew(T2, 'authenticated');
    // an admin's goodwill days on a paying centre clear its cycle; it is still a yearly payer
    await admin.call('POST', `/admin/api/institutes/${P.instituteId}/plan`, { plan: 'standard', days: 10 });

    const s = (await admin.call('GET', '/admin/api/billing')).body.summary;
    const rows = (await admin.call('GET', '/admin/api/institutes?filter=all&sort=expiring')).body
      .institutes as Row[];
    const v = views(rows, h.clock.now.getTime());
    const id = (...ts: Tenant[]) => ts.map((t) => t.instituteId).sort();

    expect(v.paying).toEqual(id(P, E, R));
    expect(v.granted).toEqual(id(G));
    expect(v.trial).toEqual(id(T1, T2));
    expect(v.ending).toEqual(id(E, T1)); // R and T2 renew by themselves
    expect(v.endingRenewing).toEqual(id(R, T2));
    expect(s).toMatchObject({
      paying: v.paying.length,
      granted: v.granted.length,
      trials: v.trial.length,
      endingSoon: v.ending.length,
      endingSoonRenewing: v.endingRenewing.length,
      ended: v.ended.length,
      // three yearly Standard plans; the given one is not money
      mrr: Math.round((3 * 299900) / 12),
      arr: Math.round((3 * 299900) / 12) * 12,
      arpu: Math.round((3 * 299900) / 12 / 3),
      byCycle: { month: 0, year: 3, pack: 0 },
      byPlan: { standard: 3 },
      // only paying centres: the trial with auto-renew approved is not paying yet, so this stays under 100%
      autoRenewing: 1,
      autoRenewingWeb: 1,
    });
    expect(s.autoRenewing).toBeLessThanOrEqual(s.paying);

    // the Overview's own counts and the Centres "Paying" filter say the same
    const o = (await admin.call('GET', '/admin/api/overview')).body;
    expect(o).toMatchObject({ trials: 2, paid: 3, granted: 1 });
    const paidFilter = (await admin.call('GET', '/admin/api/institutes?filter=paid')).body
      .institutes as Row[];
    expect(paidFilter.map((c) => c.id).sort()).toEqual(id(P, E, R));
  });

  it('a centre on a plan an admin gave says so; a ₹0 "payment" is not money', async () => {
    const G = await h.tenant('+919800000011', { institute: 'Given Free' });
    const Z = await h.tenant('+919800000012', { institute: 'Zero Rupees' });
    const P = await h.tenant('+919800000013', { institute: 'Paid' });
    await admin.call('POST', `/admin/api/institutes/${G.instituteId}/plan`, { plan: 'pro', days: 60 });
    await pay(Z, 0);
    await pay(P);

    const g = (await admin.call('GET', `/admin/api/institutes/${G.instituteId}`)).body;
    expect(g.institute).toMatchObject({ plan: 'pro', planActive: true, paidNow: false, givenByAdmin: true });
    expect(g.payUrl).toBeNull(); // the Plan card stands in for the link, saying it was given by an admin
    const z = (await admin.call('GET', `/admin/api/institutes/${Z.instituteId}`)).body.institute;
    expect(z).toMatchObject({ plan: 'standard', paidNow: false, givenByAdmin: true });
    const p = (await admin.call('GET', `/admin/api/institutes/${P.instituteId}`)).body.institute;
    expect(p).toMatchObject({ paidNow: true, givenByAdmin: false, renews: false });

    const s = (await admin.call('GET', '/admin/api/billing')).body.summary;
    expect(s).toMatchObject({ paying: 1, granted: 2, mrr: Math.round(299900 / 12) });

    // once the paid days run out, the centre is no longer paying (the plan itself has ended too)
    h.clock.now = new Date(h.clock.now.getTime() + 400 * DAY);
    admin = await h.admin(); // the dashboard session ends after 8 hours
    expect((await admin.call('GET', '/admin/api/billing')).body.summary).toMatchObject({
      paying: 0,
      granted: 0,
      mrr: 0,
    });
  });
});

describe('live activity names the centre an admin acted on', () => {
  it('shows the centre in the sentence and links to it', async () => {
    const G = await h.tenant('+919800000021', { institute: 'Bright Tuition' });
    await admin.call('POST', `/admin/api/institutes/${G.instituteId}/plan`, { plan: 'standard', days: 30 });
    await pay(G);
    const ev = (await admin.call('GET', '/admin/api/events?kinds=admin')).body.events as {
      text: string;
      instituteId: string | null;
      institute: string | null;
    }[];
    const plan = ev.find((e) => e.text.startsWith('added plan days'));
    expect(plan).toMatchObject({ instituteId: G.instituteId, institute: 'Bright Tuition' });
    expect(plan!.text).toMatch(/^added plan days for Bright Tuition · standard \+30 days, until \d{4}-\d{2}-\d{2}$/);
    const paid = ev.find((e) => e.text.startsWith('recorded a plan payment'));
    expect(paid!.text).toMatch(/^recorded a plan payment from Bright Tuition · standard \(year\) ₹2999 by upi, applied until /);
    // one centre's log shows its admin rows too
    const own = (await admin.call('GET', `/admin/api/events?kinds=admin&institute=${G.instituteId}`)).body.events;
    expect(own).toHaveLength(2);
    // searching by the centre's name finds them
    expect((await admin.call('GET', '/admin/api/events?kinds=admin&q=Bright')).body.events).toHaveLength(2);
  });

  it('a centre deleted since then cannot be opened, and the sentence says so', async () => {
    await h.db.pool.query(
      "INSERT INTO admin_audit (id, admin_user_id, admin_phone, action, target_institute_id, detail) VALUES (UUID(), NULL, 'x@example.com', 'set-plan', UUID(), 'pro +7 days, until 2026-10-15')",
    );
    const ev = (await admin.call('GET', '/admin/api/events?kinds=admin')).body.events;
    expect(ev[0]).toMatchObject({
      text: 'added plan days for a deleted centre · pro +7 days, until 2026-10-15',
      instituteId: null,
      institute: null,
    });
  });

  it('every admin action reads as a sentence', () => {
    const US = String.fromCharCode(31);
    const say = (...p: string[]) => adminText(p.join(US));
    expect(say('set-subscription', 'Bright Tuition', 'pro, active, until 2027-03-31, students 150, batches unlimited')).toBe(
      'changed the plan of Bright Tuition · pro, active, until 2027-03-31, students 150, batches unlimited',
    );
    expect(say('stop-autorenew', 'Bright Tuition', '3c9caa72-38b9-4cf2-bc0e-d37a1b2c3d4e')).toBe(
      'stopped website auto-renew for Bright Tuition',
    );
    expect(say('resend-welcome', 'Bright Tuition', 'was failed')).toBe(
      'sent the welcome message again to Bright Tuition · the last one failed',
    );
    expect(say('delete-centre', '+919800000001', 'Demo Centre · 0 students · 1 logins · test sign-up')).toBe(
      'deleted a centre · Demo Centre · 0 students · 1 logins · test sign-up',
    );
    expect(say('delete-person', '+919800000002', 'no name · test')).toBe('deleted the login +919800000002 · no name · test');
    expect(say('team-add', '', 'sanjay@example.com as Customer support')).toBe(
      'added a team member · sanjay@example.com as Customer support',
    );
    expect(say('team-change', '', 'v@example.com: support -> admin')).toBe(
      "changed a team member's role · v@example.com: support -> admin",
    );
    expect(say('team-remove', '', 'v@example.com')).toBe('removed a team member · v@example.com');
    expect(say('team-sign-out', '', 'v@example.com · 2 sessions')).toBe(
      'signed a team member out · v@example.com · 2 sessions',
    );
    expect(say('wa-recharge', '', 'Rs 5000.00')).toBe('noted a WhatsApp recharge · Rs 5000.00');
    expect(say('wa-balance', '', 'Rs 812.40')).toBe('noted the WhatsApp balance · Rs 812.40');
    expect(say('wa-rates', '', 'utility 80p · authentication 11p · marketing 78p')).toBe(
      'set the WhatsApp rates · utility 80p · authentication 11p · marketing 78p',
    );
    expect(say('wa-wallet-delete', '', '3c9caa72-38b9-4cf2-bc0e-d37a1b2c3d4e')).toBe('removed a WhatsApp wallet entry');
    // something new falls back to its code, never to nothing
    expect(say('brand-new-thing', 'Bright Tuition', '')).toBe('brand new thing Bright Tuition');
  });
});

describe("a centre's WhatsApp tab shows its messages to the owner and helpers", () => {
  it('lists only that centre, and its welcome can be sent again from there', async () => {
    const A = await h.tenant('+919876543210', { tutor: 'Kiran', institute: 'Kiran Karate Academy' });
    const B = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' });
    const one = async (t: Tenant) =>
      (await admin.call('GET', `/admin/api/owner-messages?institute=${t.instituteId}`)).body;

    const a = await one(A);
    expect(a.messages.map((m: { instituteId: string }) => m.instituteId)).toEqual([A.instituteId]);
    expect(a.messages[0]).toMatchObject({ type: 'centre_welcome', toOwner: true, recipient: 'Kiran' });
    expect(a.summary).toEqual([{ type: 'centre_welcome', status: 'queued', count: 1 }]);
    expect(a.noWelcome).toEqual([]);

    // B's welcome failed: the tab shows it, then "Send welcome again" queues a fresh one
    await h.db.pool.query(
      "UPDATE centre_messages SET status = 'failed', error = 'gateway-500' WHERE institute_id = ?",
      [B.instituteId],
    );
    expect((await one(B)).topErrors).toEqual([{ error: 'gateway-500', count: 1 }]);
    expect((await admin.call('POST', `/admin/api/institutes/${B.instituteId}/welcome`)).status).toBe(200);
    expect((await one(B)).messages).toMatchObject([{ type: 'centre_welcome', status: 'queued' }]);
    expect((await one(A)).messages).toHaveLength(1);

    // a centre never sent a welcome is named, however old it is
    await h.db.pool.query('DELETE FROM centre_messages WHERE institute_id = ?', [A.instituteId]);
    await h.db.pool.query('UPDATE institutes SET created_at = ? WHERE id = ?', [
      new Date('2025-01-01T00:00:00Z'),
      A.instituteId,
    ]);
    expect((await one(A)).noWelcome).toMatchObject([{ instituteId: A.instituteId, hasPhone: true }]);
    expect((await admin.call('GET', '/admin/api/owner-messages?institute=nope')).status).toBe(400);
  });
});
