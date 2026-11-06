import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { hashOtp, newId, newOtp } from '../lib/ids.js';
import { withNamedLock } from '../lib/lock.js';
import { uuid } from '../lib/params.js';
import type { Mailer } from '../auth/mailer.js';
import { deleteAccount, deleteCentre } from '../account/service.js';
import type { AdminIdentity } from './auth.js';
import { ROLE_LABEL } from './team.js';

/**
 * Deleting test and dummy centres and people (decision 158). It always takes two steps:
 *  1. An admin (or the super admin) picks what to delete and asks. A 6-digit code is emailed to the super admin
 *     (ADMIN_EMAILS) only, with what will go, who asked and why.
 *  2. Whoever asked types that code. If the super admin asked, they read it from their own email; anyone else has to
 *     get it from the super admin, so nothing is deleted without them.
 * The code lasts 10 minutes, allows 5 tries, works once and only for the request and the person who asked. Every
 * deletion is in the audit log, and the super admin gets an email once it is done.
 */
export const DELETE_LIMITS = { codeMinutes: 10, codeAttempts: 5, maxTargets: 50 } as const;

export const deletionTargets = z.object({
  kind: z.enum(['centre', 'person']),
  ids: z.array(uuid).min(1).max(DELETE_LIMITS.maxTargets),
});
export const deletionBody = deletionTargets.extend({
  reason: z.string().trim().max(200).default(''),
});

export interface CentrePreview {
  id: string;
  name: string;
  owner: string;
  phone: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  students: number;
  batches: number;
  helpers: number;
  feesRecorded: number;
  planPaid: number;
  plan: string | null;
  warnings: string[];
  /** nothing can be deleted while this is set */
  blocker: string | null;
}
export interface PersonPreview {
  id: string;
  name: string;
  phone: string | null;
  role: 'owner' | 'staff' | null;
  centre: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  warnings: string[];
  blocker: string | null;
}

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0);
const rupees = (paise: number) => `Rs ${Math.round(paise / 100).toLocaleString('en-IN')}`;

/** What would go: the centres or people with their numbers, and what speaks against deleting each. */
export async function previewDeletion(
  pool: Pool,
  t: z.infer<typeof deletionTargets>,
  now: Date,
): Promise<
  { kind: 'centre'; items: CentrePreview[] } | { kind: 'person'; items: PersonPreview[] }
> {
  const ids = [...new Set(t.ids)];
  if (t.kind === 'centre') {
    const [rows] = (await pool.query(
      `SELECT i.id, i.name, i.created_at, u.name AS owner, u.phone,
              s.plan, s.status, s.expires_at, s.store_will_renew,
              (SELECT COUNT(*) FROM students st WHERE st.institute_id = i.id) AS students,
              (SELECT COUNT(*) FROM batches b WHERE b.institute_id = i.id) AS batches,
              (SELECT COUNT(*) FROM memberships m WHERE m.institute_id = i.id AND m.role = 'staff') AS helpers,
              (SELECT COUNT(*) FROM payments p WHERE p.institute_id = i.id AND p.amount > 0) AS fees,
              (SELECT COALESCE(SUM(be.amount), 0) FROM billing_events be
                WHERE be.institute_id = i.id AND be.status = 'applied' AND be.amount > 0) AS plan_paid,
              (SELECT COUNT(*) FROM web_subscriptions w WHERE w.institute_id = i.id
                 AND w.status IN ('authenticated','active','pending') AND w.cancel_at_cycle_end = 0) AS autorenew,
              (SELECT MAX(a.created_at) FROM activity_log a WHERE a.institute_id = i.id) AS last_activity
         FROM institutes i
         JOIN users u ON u.id = i.owner_user_id
         LEFT JOIN subscriptions s ON s.institute_id = i.id
        WHERE i.id IN (?)`,
      [ids],
    )) as unknown as [
      {
        id: string;
        name: string;
        created_at: Date;
        owner: string;
        phone: string | null;
        plan: string | null;
        status: string | null;
        expires_at: Date | null;
        store_will_renew: number | null;
        students: number;
        batches: number;
        helpers: number;
        fees: number;
        plan_paid: number;
        autorenew: number;
        last_activity: Date | null;
      }[],
    ];
    if (rows.length !== ids.length) throw notFound();
    return {
      kind: 'centre',
      items: rows.map((r) => {
        const warnings: string[] = [];
        const paidActive =
          r.plan &&
          r.plan !== 'trial' &&
          r.status === 'active' &&
          r.expires_at &&
          r.expires_at > now;
        if (paidActive)
          warnings.push(
            `On a paid ${r.plan} plan until ${r.expires_at!.toISOString().slice(0, 10)}`,
          );
        if (n(r.plan_paid) > 0)
          warnings.push(`Has paid ${rupees(n(r.plan_paid))} for plans (the records are kept)`);
        if (n(r.store_will_renew))
          warnings.push('Renews through the App Store or Google Play: cancel it there too');
        if (n(r.students) >= 10)
          warnings.push(`${n(r.students)} students: looks like a real centre`);
        if (r.last_activity && now.getTime() - r.last_activity.getTime() < 3 * DAY)
          warnings.push('Used in the last 3 days');
        return {
          id: r.id,
          name: r.name,
          owner: r.owner,
          phone: r.phone,
          createdAt: r.created_at.toISOString(),
          lastActivityAt: r.last_activity?.toISOString() ?? null,
          students: n(r.students),
          batches: n(r.batches),
          helpers: n(r.helpers),
          feesRecorded: n(r.fees),
          planPaid: n(r.plan_paid),
          plan: r.plan,
          warnings,
          blocker: n(r.autorenew)
            ? 'Website auto-renew is on. Stop it on the Billing tab first.'
            : null,
        };
      }),
    };
  }
  const [rows] = (await pool.query(
    `SELECT u.id, u.name, u.phone, u.created_at, u.last_login_at, m.role, i.name AS centre
       FROM users u LEFT JOIN memberships m ON m.user_id = u.id LEFT JOIN institutes i ON i.id = m.institute_id
      WHERE u.id IN (?)`,
    [ids],
  )) as unknown as [
    {
      id: string;
      name: string;
      phone: string | null;
      created_at: Date;
      last_login_at: Date | null;
      role: 'owner' | 'staff' | null;
      centre: string | null;
    }[],
  ];
  if (rows.length !== ids.length) throw notFound();
  return {
    kind: 'person',
    items: rows.map((r) => {
      const warnings: string[] = [];
      if (r.role === 'staff')
        warnings.push(`Helper at ${r.centre ?? 'a centre'}: the centre stays`);
      if (r.last_login_at && now.getTime() - r.last_login_at.getTime() < 3 * DAY)
        warnings.push('Signed in during the last 3 days');
      return {
        id: r.id,
        name: r.name,
        phone: r.phone,
        role: r.role,
        centre: r.centre,
        createdAt: r.created_at.toISOString(),
        lastLoginAt: r.last_login_at?.toISOString() ?? null,
        warnings,
        // an owner goes with their centre, so it is deleted from the centre (where the numbers are shown)
        blocker:
          r.role === 'owner'
            ? `Owner of ${r.centre ?? 'a centre'}: delete the centre instead`
            : null,
      };
    }),
  };
}

function describe(p: Awaited<ReturnType<typeof previewDeletion>>) {
  if (p.kind === 'centre')
    return (p.items as CentrePreview[])
      .map(
        (c) =>
          `${c.name} (owner ${c.owner || 'no name'}${c.phone ? ` ${c.phone}` : ''}; ${c.students} students, ${c.helpers} helpers)`,
      )
      .join('; ');
  return (p.items as PersonPreview[])
    .map(
      (u) =>
        `${u.name || 'no name'}${u.phone ? ` ${u.phone}` : ''}${u.centre ? ` (helper at ${u.centre})` : ''}`,
    )
    .join('; ');
}
/** One line per target, numbered, with its warnings: the approval email shows all of them, never a cut list. */
function targetLines(p: Awaited<ReturnType<typeof previewDeletion>>) {
  const one = { ...p } as typeof p;
  return p.items.map((item, i) => {
    const text = describe({ ...one, items: [item] } as typeof p);
    const warnings = (item as { warnings?: string[] }).warnings ?? [];
    return `${i + 1}. ${text}${warnings.length ? ` — ${warnings.join(' ')}` : ''}`;
  });
}
const count = (kind: 'centre' | 'person', k: number) =>
  kind === 'centre' ? `${k} centre${k === 1 ? '' : 's'}` : `${k} ${k === 1 ? 'person' : 'people'}`;

function mail(to: string, subject: string, lines: string[], code?: string) {
  const text = [
    ...(code ? [`Code: ${code}`, ''] : []),
    ...lines,
    '',
    'Chalkpis Admin · M2W Technologies Private Limited',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#262626">
${code ? `<p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>` : ''}
${lines.map((l) => `<p style="font-size:14px;line-height:1.5">${l.replace(/[<>&]/g, '')}</p>`).join('')}
<p style="font-size:12px;color:#a3a3a3;margin-top:24px">Chalkpis Admin · M2W Technologies Private Limited</p></div>`;
  return { to, subject, text, html };
}
const codeHash = (pepper: string, id: string, code: string) =>
  hashOtp(pepper, `admin-delete:${id}`, code);
const masked = (email: string) => email.replace(/^(.)[^@]*(@.*)$/, '$1•••$2');

export interface DeletionDeps {
  pool: Pool;
  mailer: Mailer | null;
  superEmails: string[];
  pepper: string;
  devEcho: boolean;
  filesDir: string;
}

/** Step 1: checks the targets, and emails a code for this request to the super admin. */
export async function requestDeletion(
  d: DeletionDeps,
  who: AdminIdentity,
  input: z.infer<typeof deletionBody>,
  meta: { ip: string },
  now: Date,
) {
  if (!d.mailer || !d.superEmails.length) throw new AppError(503, 'email_unavailable');
  const preview = await previewDeletion(d.pool, input, now);
  const blocked = preview.items.find((i) => i.blocker);
  if (blocked) throw new AppError(409, 'cannot_delete', { message: blocked.blocker });
  const id = newId();
  const code = newOtp();
  // The stored summary is short; the email lists every target with its warnings, because the code it carries
  // approves all of them (it must never approve something the super admin was not shown).
  const summary = describe(preview).slice(0, 1000);
  const what = count(preview.kind, preview.items.length);
  const everyTarget = targetLines(preview);
  // one open request per admin: an older one stops working
  await d.pool.query(
    "UPDATE admin_deletions SET status = 'cancelled' WHERE requested_by = ? AND status = 'pending'",
    [who.adminId],
  );
  await d.pool.query(
    `INSERT INTO admin_deletions (id, requested_by, requested_email, kind, targets, summary, reason, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      who.adminId,
      who.email,
      preview.kind,
      JSON.stringify(preview.items.map((i) => i.id)),
      summary,
      input.reason,
      codeHash(d.pepper, id, code),
      new Date(now.getTime() + DELETE_LIMITS.codeMinutes * 60_000),
      now,
    ],
  );
  const asker = `${who.name || who.email} (${ROLE_LABEL[who.role]}, ${who.email})`;
  const self = who.role === 'super';
  let sent = 0;
  for (const to of d.superEmails)
    if (
      await d.mailer.send(
        mail(
          to,
          `${code} is the code to delete ${what} from Chalkpis`,
          [
            `${asker} asked to delete ${what}:`,
            ...everyTarget,
            `Reason: ${input.reason || 'none given'}.`,
            'Everything in them goes for good: students, batches, attendance, fees, messages and their logins. Plan payment records are kept.',
            self
              ? `Enter the code in the dashboard to delete. It works for ${DELETE_LIMITS.codeMinutes} minutes.`
              : `If you agree, give ${who.name || who.email} this code. It works for ${DELETE_LIMITS.codeMinutes} minutes, only for this request. If you do not agree, do nothing: nothing is deleted.`,
            `Asked from ${meta.ip || 'unknown'}.`,
          ],
          code,
        ),
      )
    )
      sent++;
  if (!sent) {
    await d.pool.query("UPDATE admin_deletions SET status = 'cancelled' WHERE id = ?", [id]);
    throw new AppError(503, 'email_unavailable');
  }
  return {
    id,
    sentTo: d.superEmails.map(masked),
    expiresAt: new Date(now.getTime() + DELETE_LIMITS.codeMinutes * 60_000).toISOString(),
    ...(d.devEcho ? { devCode: code } : {}),
  };
}

/** Step 2: the code from the super admin's email. Right code: everything in the request is deleted. */
export async function confirmDeletion(
  d: DeletionDeps,
  who: AdminIdentity,
  id: string,
  code: unknown,
  now: Date,
  audit: (
    action: string,
    t: { userId?: string; instituteId?: string; phone?: string; detail: string },
  ) => Promise<void>,
) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new AppError(400, 'invalid_code');
  const req = await withNamedLock(d.pool, `admindelete:${id}`, async (c) => {
    const [rows] = (await c.query(
      'SELECT id, requested_by, kind, targets, summary, reason, code_hash, attempts, status, expires_at FROM admin_deletions WHERE id = ?',
      [id],
    )) as unknown as [
      {
        id: string;
        requested_by: string;
        kind: 'centre' | 'person';
        targets: string;
        summary: string;
        reason: string;
        code_hash: string;
        attempts: number;
        status: string;
        expires_at: Date;
      }[],
    ];
    const r = rows[0];
    // only the person who asked can finish it, and only once, in time, within the tries
    if (!r || r.requested_by !== who.adminId) throw notFound();
    if (r.status !== 'pending' || r.expires_at <= now || r.attempts >= DELETE_LIMITS.codeAttempts)
      throw new AppError(410, 'code_expired');
    const given = Buffer.from(codeHash(d.pepper, id, code));
    const stored = Buffer.from(r.code_hash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      await c.query('UPDATE admin_deletions SET attempts = attempts + 1 WHERE id = ?', [id]);
      throw new AppError(400, 'invalid_code', {
        triesLeft: DELETE_LIMITS.codeAttempts - r.attempts - 1,
      });
    }
    await c.query("UPDATE admin_deletions SET status = 'done', done_at = ? WHERE id = ?", [
      now,
      id,
    ]);
    return r;
  });

  const ids = JSON.parse(req.targets) as string[];
  // checked again now: something may have changed in the minutes since the code was sent
  const preview = await previewDeletion(d.pool, { kind: req.kind, ids }, now).catch(() => null);
  const items = (preview?.items ?? []) as (CentrePreview | PersonPreview)[];
  const deleted: string[] = [];
  const skipped: { name: string; why: string }[] = [];
  for (const id of ids) {
    const item = items.find((i) => i.id === id);
    if (!item) {
      skipped.push({ name: id, why: 'already gone' });
      continue;
    }
    if (item.blocker) {
      skipped.push({ name: item.name, why: item.blocker });
      continue;
    }
    if (req.kind === 'centre') {
      const c = item as CentrePreview;
      const r = await deleteCentre(d.pool, d.filesDir, id);
      await audit('delete-centre', {
        instituteId: id,
        phone: c.phone ?? '',
        detail: `${c.name} · ${c.students} students · ${r.logins} logins · ${req.reason || 'no reason'}`,
      });
    } else {
      const u = item as PersonPreview;
      await deleteAccount(d.pool, d.filesDir, id);
      await audit('delete-person', {
        userId: id,
        phone: u.phone ?? '',
        detail: `${u.name || 'no name'}${u.centre ? ` · helper at ${u.centre}` : ''} · ${req.reason || 'no reason'}`,
      });
    }
    deleted.push(item.name || item.id);
  }
  if (d.mailer)
    for (const to of d.superEmails)
      await d.mailer.send(
        mail(to, `Deleted ${count(req.kind, deleted.length)} from Chalkpis`, [
          `${who.name || who.email} deleted ${count(req.kind, deleted.length)} with your code: ${deleted.join(', ') || 'none'}.`,
          ...(skipped.length
            ? [`Not deleted: ${skipped.map((s) => `${s.name} (${s.why})`).join(', ')}.`]
            : []),
          `Reason: ${req.reason || 'none given'}. It is in the audit log.`,
        ]),
      );
  return { deleted: deleted.length, skipped };
}

/** Stops a request that is still open (the code then does nothing). */
export async function cancelDeletion(pool: Pool, who: AdminIdentity, id: string) {
  await pool.query(
    "UPDATE admin_deletions SET status = 'cancelled' WHERE id = ? AND requested_by = ? AND status = 'pending'",
    [id, who.adminId],
  );
}
