import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MockMailer } from '../src/auth/mailer.js';
import { gatherDailySummary, sendDailySummary } from '../src/admin/dailySummary.js';
import { makeJobs, runDueJobs } from '../src/jobs/runner.js';
import { newId } from '../src/lib/ids.js';
import { meterSend } from '../src/messaging/meter.js';
import { startHarness, TEST_ADMIN_EMAIL, type Harness, type Tenant } from './helpers.js';

/**
 * The super admins' daily email (decision 166). The harness clock is Thu 8 Oct 2026, 11:30 am IST, so the email is
 * about Wed 7 Oct.
 */

const mailer = new MockMailer();
let h: Harness;
let admin: Tenant;
beforeAll(async () => {
  h = await startHarness({}, { mailer });
});
afterAll(() => h.close());
beforeEach(async () => {
  await h.reset();
  mailer.sent = [];
  admin = await h.admin();
});

const ist = (s: string) => new Date(`${s}+05:30`);
const set = (sql: string, args: unknown[]) => h.db.pool.query(sql, args);
const made = (t: Tenant, at: string) =>
  set('UPDATE institutes SET created_at = ? WHERE id = ?', [ist(at), t.instituteId]);
const trialEnds = (t: Tenant, at: string) =>
  set('UPDATE subscriptions SET expires_at = ? WHERE institute_id = ?', [ist(at), t.instituteId]);

/** A busy Wednesday: a new centre, a payment, a trial ending today, one that ended, WhatsApp spend. */
async function busyDay() {
  const fresh = await h.tenant('+919876543210', { tutor: 'Ravi', institute: 'Sri <Abacus>' });
  await made(fresh, '2026-10-07T10:00:00');
  await set(
    "UPDATE institutes SET category = 'abacus', city = 'Vellore', heard_from = 'instagram', signup_channel = 'web', signup_phone = 'ios' WHERE id = ?",
    [fresh.instituteId],
  );

  const paid = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' });
  await made(paid, '2026-09-01T10:00:00');
  expect(
    (
      await admin.call('POST', `/admin/api/institutes/${paid.instituteId}/plan-payments`, {
        planId: 'standard',
        cycle: 'year',
        amountPaise: 299900,
        method: 'upi',
        apply: true,
      })
    ).status,
  ).toBe(201);
  await set('UPDATE billing_events SET created_at = ? WHERE institute_id = ?', [
    ist('2026-10-07T15:00:00'),
    paid.instituteId,
  ]);

  const ending = await h.tenant('+919000000001', { tutor: 'Kavya', institute: 'Kavya Tuition' });
  await made(ending, '2026-10-05T09:00:00');
  await trialEnds(ending, '2026-10-08T18:00:00');

  const ended = await h.tenant('+919000000002', { tutor: 'Arun', institute: 'Arun Karate' });
  await made(ended, '2026-10-04T09:00:00');
  await trialEnds(ended, '2026-10-07T20:00:00');

  // an iPhone owner's trial from the website waits for the app, so it is not "ending"
  const waiting = await h.tenant('+919000000003', { tutor: 'Iqbal', institute: 'Iqbal Classes' });
  await made(waiting, '2026-10-06T09:00:00');
  await trialEnds(waiting, '2026-10-08T19:00:00');
  await set('UPDATE institutes SET trial_on_first_app_use = 1 WHERE id = ?', [waiting.instituteId]);

  // verified a number yesterday and stopped there
  await set('INSERT INTO users (id, phone, created_at) VALUES (?, ?, ?)', [
    newId(),
    '+919000000009',
    ist('2026-10-07T21:00:00'),
  ]);

  for (let i = 0; i < 50; i++)
    await meterSend(h.db.pool, ist('2026-10-07T12:00:00'), 'absent', paid.instituteId);
  await admin.call('POST', '/admin/api/wa-spend/wallet', { kind: 'balance', amount: 1_000_000 });
}

describe('daily summary email', () => {
  it("counts yesterday's sign-ups, payments, trials and WhatsApp as the dashboard does", async () => {
    await busyDay();
    const s = await gatherDailySummary(h.db.pool, h.clock.now);
    expect(s.day).toBe('2026-10-07');
    expect(s.signups).toEqual([
      expect.objectContaining({
        name: 'Sri <Abacus>',
        owner: 'Ravi',
        phone: '+919876543210',
        category: 'abacus',
        city: 'Vellore',
        heardFrom: 'Instagram/Facebook',
        channel: 'website (iPhone)',
      }),
    ]);
    expect(s.signupsMonth).toBe(4); // 4, 5, 6 and 7 Oct; Meena Dance is from September
    expect(s.unfinished).toBe(1);
    expect(s.payments).toEqual([
      {
        centre: 'Meena Dance',
        plan: 'Standard yearly',
        amount: 299900,
        source: 'recorded by an admin',
      },
    ]);
    expect(s.revenueMonth).toBe(299900);
    expect(s.paying).toBe(1);
    expect(s.mrr).toBe(Math.round(299900 / 12));
    expect(s.trialsEnding.map((t) => [t.name, t.today])).toEqual([['Kavya Tuition', true]]);
    expect(s.trialsEnded.map((t) => t.name)).toEqual(['Arun Karate']);
    expect(s.whatsapp).toMatchObject({
      status: 'ok',
      balance: 1_000_000,
      sent: 50,
      spent: 1000,
      failed: 0,
    });
  });

  it('emails each super admin a short report, with names escaped', async () => {
    await busyDay();
    expect(
      await sendDailySummary(
        h.db.pool,
        mailer,
        [TEST_ADMIN_EMAIL, 'second@chalkpis.test'],
        h.clock.now,
        'https://tutor.chalkpis.com/',
      ),
    ).toBe(2);
    const m = mailer.sent[0]!;
    expect(mailer.sent.map((x) => x.to)).toEqual([TEST_ADMIN_EMAIL, 'second@chalkpis.test']);
    expect(m.subject).toBe('Chalkpis daily · Wed, 7 Oct: 1 new centre, ₹2,999 paid');
    expect(m.text).toContain('New centres: 1 (4 this month)');
    expect(m.text).toContain(
      '- Sri <Abacus> (abacus) · Ravi · Vellore · heard from Instagram/Facebook · website (iPhone) · no students yet · +919876543210',
    );
    expect(m.text).toContain('1 number was verified but no centre set up yet');
    expect(m.text).toContain('- Meena Dance · Standard yearly · ₹2,999 · recorded by an admin');
    expect(m.text).toContain('Paying centres: 1 (MRR ₹250 · 3 on trial)');
    expect(m.text).toContain('Kavya Tuition · Kavya · no students yet · ends today 6:00 pm');
    expect(m.text).not.toContain('Iqbal');
    expect(m.text).toContain('Trials that ended without paying (1)');
    expect(m.text).toContain('Yesterday: 50 messages, about ₹10 · none failed');
    expect(m.text).toContain('Dashboard: https://tutor.chalkpis.com/admin');
    expect(m.html).toContain('Sri &lt;Abacus&gt;');
    expect(m.html).not.toContain('<Abacus>');
    expect(m.html).toContain('href="tel:+919876543210"');
  });

  it('says so plainly on a quiet day, and flags a low WhatsApp balance in the subject', async () => {
    await admin.call('POST', '/admin/api/wa-spend/wallet', { kind: 'balance', amount: 10_000 });
    await sendDailySummary(h.db.pool, mailer, [TEST_ADMIN_EMAIL], h.clock.now);
    const m = mailer.sent[0]!;
    expect(m.subject).toBe(
      'Chalkpis daily · Wed, 7 Oct: no new centres, no payments, WhatsApp balance low',
    );
    expect(m.text).toContain('No new centres yesterday.');
    expect(m.text).toContain('No plan payments yesterday.');
    expect(m.text).not.toContain('Trials ending');
    expect(m.text).toContain('Recharge at wa.adsme.in soon.');
    expect(m.text).not.toContain('Dashboard:');
  });

  it('goes out once a day from 8 am Indian time, only when email is set up', async () => {
    const jobs = makeJobs(undefined, null, null, {
      mailer,
      emails: [TEST_ADMIN_EMAIL],
    }).filter((j) => j.name === 'admin-daily-summary');
    expect(jobs).toHaveLength(1);
    const log = { info: () => {}, error: () => {} };
    expect(await runDueJobs(h.db.pool, ist('2026-10-08T07:30:00'), log, jobs)).toEqual([]);
    expect(await runDueJobs(h.db.pool, ist('2026-10-08T08:00:00'), log, jobs)).toEqual([
      'admin-daily-summary',
    ]);
    expect(await runDueJobs(h.db.pool, ist('2026-10-08T09:00:00'), log, jobs)).toEqual([]);
    expect(mailer.sent).toHaveLength(1);
    expect(
      makeJobs(undefined, null, null, { mailer: null, emails: [TEST_ADMIN_EMAIL] }).some(
        (j) => j.name === 'admin-daily-summary',
      ),
    ).toBe(false);
  });
});
