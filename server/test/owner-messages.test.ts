import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  A = await h.tenant('+919876543210', { tutor: 'Kiran', institute: 'Kiran Karate Academy' });
  B = await h.tenant('+919123456789', { tutor: 'Meena', institute: 'Meena Dance' });
});

const status = (t: Tenant, s: string) =>
  h.db.pool.query(
    "UPDATE centre_messages SET status = ?, error = ? WHERE institute_id = ? AND type = 'centre_welcome'",
    [s, s === 'failed' ? 'gateway-500' : null, t.instituteId],
  );

it('lists the messages to owners and helpers, with a 7-day summary and why some did not go', async () => {
  await status(A, 'failed');
  const admin = await h.admin();
  const r = await admin.call('GET', '/admin/api/owner-messages');
  expect(r.status).toBe(200);
  expect(r.body.messages).toHaveLength(2);
  expect(
    r.body.messages.find((m: { institute: string }) => m.institute === 'Kiran Karate Academy'),
  ).toMatchObject({
    type: 'centre_welcome',
    status: 'failed',
    why: 'gateway-500',
    toOwner: true,
    recipient: 'Kiran',
    to: '•••• 3210',
  });
  expect(r.body.summary).toEqual(
    expect.arrayContaining([
      { type: 'centre_welcome', status: 'failed', count: 1 },
      { type: 'centre_welcome', status: 'queued', count: 1 },
    ]),
  );
  expect(r.body.topErrors).toEqual([{ error: 'gateway-500', count: 1 }]);
  expect(
    (await admin.call('GET', '/admin/api/owner-messages?status=failed')).body.messages,
  ).toHaveLength(1);
  expect(r.body.noWelcome).toEqual([]);
});

it('shows a new centre whose owner never got a welcome, and the admin can send it', async () => {
  await h.db.pool.query('DELETE FROM centre_messages WHERE institute_id = ?', [B.instituteId]);
  const admin = await h.admin();
  expect((await admin.call('GET', '/admin/api/owner-messages')).body.noWelcome).toMatchObject([
    { instituteId: B.instituteId, name: 'Meena Dance', owner: 'Meena', hasPhone: true },
  ]);
  expect((await admin.call('POST', `/admin/api/institutes/${B.instituteId}/welcome`)).status).toBe(
    200,
  );
  const after = (await admin.call('GET', '/admin/api/owner-messages')).body;
  expect(after.noWelcome).toEqual([]);
  expect(
    after.messages.find((m: { instituteId: string }) => m.instituteId === B.instituteId),
  ).toMatchObject({
    type: 'centre_welcome',
    status: 'queued',
  });
});

it('a failed or sent welcome can be sent again; one still on its way cannot', async () => {
  const admin = await h.admin();
  const resend = () => admin.call('POST', `/admin/api/institutes/${A.instituteId}/welcome`);
  expect([(await resend()).status, (await resend()).body.error]).toEqual([409, 'in_progress']);
  await status(A, 'failed');
  expect((await resend()).status).toBe(200);
  const [rows] = (await h.db.pool.query(
    "SELECT status, error, vars FROM centre_messages WHERE institute_id = ? AND type = 'centre_welcome'",
    [A.instituteId],
  )) as unknown as [{ status: string; error: string | null; vars: string }[]];
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: 'queued', error: null });
  expect(JSON.parse(rows[0]!.vars)[1]).toBe('Kiran Karate Academy');
  const [audit] = (await h.db.pool.query(
    "SELECT detail FROM admin_audit WHERE action = 'resend-welcome'",
  )) as unknown as [{ detail: string }[]];
  expect(audit.map((a) => a.detail)).toEqual(['was failed']);
  expect(
    (await admin.call('POST', '/admin/api/institutes/00000000-0000-4000-8000-000000000000/welcome'))
      .status,
  ).toBe(404);
});

it('is for admins only', async () => {
  expect((await A.call('GET', '/admin/api/owner-messages')).status).toBe(401);
  expect((await A.call('POST', `/admin/api/institutes/${A.instituteId}/welcome`)).status).toBe(401);
});
