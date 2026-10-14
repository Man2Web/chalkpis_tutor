import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let T: Tenant;
let admin: Tenant;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  T = await h.tenant('+919800000001', { institute: 'Sunrise Dance' });
  admin = await h.admin();
});

const sub = async () =>
  (
    (await h.db.pool.query(
      'SELECT plan, status, expires_at, student_limit, batch_limit FROM subscriptions WHERE institute_id = ?',
      [T.instituteId],
    )) as unknown as [
      {
        plan: string;
        status: string;
        expires_at: Date;
        student_limit: number | null;
        batch_limit: number | null;
      }[],
    ]
  )[0][0]!;

describe('admin: full control of a subscription', () => {
  it('sets plan, status, last day and custom limits exactly, and logs it', async () => {
    const r = await admin.call('PUT', `/admin/api/institutes/${T.instituteId}/subscription`, {
      plan: 'standard',
      status: 'active',
      endsOn: '2027-03-31',
      studentLimit: 150,
      batchLimit: null,
    });
    expect(r.status).toBe(200);
    expect(await sub()).toMatchObject({
      plan: 'standard',
      status: 'active',
      student_limit: 150,
      batch_limit: null,
    });
    expect((await sub()).expires_at.toISOString()).toBe('2027-03-31T18:29:59.999Z');
    const detail = (await admin.call('GET', `/admin/api/institutes/${T.instituteId}`)).body
      .institute;
    expect(detail).toMatchObject({ studentLimit: 150, batchLimit: null, planStatus: 'active' });
    const audit = (await admin.call('GET', '/admin/api/audit')).body.audit;
    expect(JSON.stringify(audit)).toContain('set-subscription');

    // ending it: the app turns read-only for the centre
    await admin.call('PUT', `/admin/api/institutes/${T.instituteId}/subscription`, {
      plan: 'standard',
      status: 'expired',
      endsOn: '2026-10-07',
      studentLimit: 150,
      batchLimit: null,
    });
    expect((await T.call('GET', '/subscription')).body.active).toBe(false);
    expect(
      (
        await admin.call('PUT', `/admin/api/institutes/${T.instituteId}/subscription`, {
          plan: 'gold',
        })
      ).status,
    ).toBe(400);
  });

  it('extending as Trial clears the paid limits (a trial has none)', async () => {
    await h.db.pool.query(
      "UPDATE subscriptions SET plan = 'starter', student_limit = 50, batch_limit = 3 WHERE institute_id = ?",
      [T.instituteId],
    );
    await admin.call('POST', `/admin/api/institutes/${T.instituteId}/plan`, {
      plan: 'trial',
      days: 30,
    });
    expect(await sub()).toMatchObject({ plan: 'trial', student_limit: null, batch_limit: null });
  });

  it('records an offline plan payment, with or without applying the plan', async () => {
    const r = await admin.call('POST', `/admin/api/institutes/${T.instituteId}/plan-payments`, {
      planId: 'pro',
      amountPaise: 99900,
      method: 'bank',
      reference: 'UTR 1234',
      apply: true,
    });
    expect(r.status).toBe(201);
    expect(await sub()).toMatchObject({ plan: 'pro', status: 'active', student_limit: null });
    const history = (await T.call('GET', '/billing')).body.history;
    expect(history[0]).toMatchObject({ provider: 'manual', planId: 'pro', amountPaise: 99900 });
    const detail = (await admin.call('GET', `/admin/api/institutes/${T.instituteId}`)).body;
    expect(detail.billing[0]).toMatchObject({
      provider: 'manual',
      method: 'bank',
      note: 'UTR 1234',
    });

    const before = (await sub()).expires_at.getTime();
    await admin.call('POST', `/admin/api/institutes/${T.instituteId}/plan-payments`, {
      planId: 'starter',
      amountPaise: 50000,
      method: 'cash',
      apply: false,
    });
    expect((await sub()).expires_at.getTime()).toBe(before); // only the money was recorded
    expect((await T.call('GET', '/billing')).body.history).toHaveLength(2);

    // the Billing page: revenue, recurring revenue from the running Pro plan, and both payments, newest first
    const other = await h.tenant('+919800000002', { institute: 'Moon Yoga' }); // still on its trial
    const b = (await admin.call('GET', '/admin/api/billing')).body;
    expect(b.summary).toMatchObject({
      revenueThisMonth: 149900,
      revenueAllTime: 149900,
      paymentsAllTime: 2,
      paying: 1,
      trials: 1,
      mrr: Math.round(99900 / 12),
    });
    expect(b.payments).toHaveLength(2);
    expect(b.payments[0]).toMatchObject({
      centre: 'Sunrise Dance',
      plan: 'starter',
      amount: 50000,
      provider: 'manual',
      method: 'cash',
      status: 'paid',
    });
    expect(b.payments[1]).toMatchObject({ plan: 'pro', reference: 'UTR 1234' });
    // search by centre
    expect((await admin.call('GET', '/admin/api/billing?q=moon')).body.payments).toHaveLength(0);
    expect(other.instituteId).toBeTruthy();
    // tutors cannot see it
    expect((await T.call('GET', '/admin/api/billing')).status).toBe(401);
  });

  it('a tutor cannot use these endpoints', async () => {
    expect(
      (
        await T.call('PUT', `/admin/api/institutes/${T.instituteId}/subscription`, {
          plan: 'pro',
          status: 'active',
          endsOn: '2030-01-01',
          studentLimit: null,
          batchLimit: null,
        })
      ).status,
    ).toBe(401);
  });
});
