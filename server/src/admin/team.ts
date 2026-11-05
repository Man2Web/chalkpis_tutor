import { z } from 'zod';
import type { Pool } from '../db.js';
import { AppError, notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import type { Mailer } from '../auth/mailer.js';

/**
 * The admin team (decision 158). Three roles:
 *  - super: the product owner, the ADMIN_EMAILS setting (never set from the dashboard). Everything, plus the Team page,
 *    and the deletion codes come to them.
 *  - admin: runs Chalkpis day to day (plans, payments, blocks, announcements, revenue) and can ask for a deletion.
 *  - support: customer support. Looks centres and people up, helps with sign-in and WhatsApp, keeps notes and tags.
 * The role is read from the database on every request, so a change or a removal works at once.
 */
export type AdminRole = 'super' | 'admin' | 'support';
export const ROLE_LABEL: Record<AdminRole, string> = {
  super: 'Super admin',
  admin: 'Admin',
  support: 'Customer support',
};

/** What a role may do. Every /admin/api route names one of these. */
export const CAPS = {
  /** see centres, people, activity, WhatsApp, login codes, system health */
  view: ['super', 'admin', 'support'],
  /** help a customer: sign out, retry a message, resend the welcome, notes and tags */
  help: ['super', 'admin', 'support'],
  /** company money: revenue, payments, subscriptions overview, analytics, retention */
  money: ['super', 'admin'],
  /** change things: plans, plan payments, auto-renew, block, announcements, WhatsApp wallet */
  manage: ['super', 'admin'],
  /** bulk copies of personal data, and the audit log */
  export: ['super', 'admin'],
  /** ask to delete test centres and people (the code goes to the super admin) */
  delete: ['super', 'admin'],
  /** add, change and remove team members */
  team: ['super'],
} as const satisfies Record<string, readonly AdminRole[]>;
export type Cap = keyof typeof CAPS;
export const can = (role: AdminRole, cap: Cap) =>
  (CAPS[cap] as readonly AdminRole[]).includes(role);
export const capsOf = (role: AdminRole) => (Object.keys(CAPS) as Cap[]).filter((c) => can(role, c));

/** The role behind an account row: super admins come from the setting; a removed member has none. */
export function roleOf(
  superEmails: string[],
  row: { email: string; role: string | null; removed_at: Date | null },
): AdminRole | null {
  if (superEmails.includes(row.email.toLowerCase())) return 'super';
  if (row.removed_at) return null;
  return row.role === 'admin' || row.role === 'support' ? row.role : null;
}

export const memberBody = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/),
  name: z.string().trim().max(80).default(''),
  role: z.enum(['admin', 'support']),
});
export const memberUpdate = z.object({
  name: z.string().trim().max(80).optional(),
  role: z.enum(['admin', 'support']).optional(),
});

interface Row {
  id: string;
  email: string;
  role: string | null;
  name: string;
  added_by: string;
  password_hash: string | null;
  last_login_at: Date | null;
  removed_at: Date | null;
  created_at: Date;
  sessions: number;
}

/** Everyone who can (or could) open the dashboard: super admins first, then the team, removed members last. */
export async function listTeam(pool: Pool, superEmails: string[], now: Date) {
  const [rows] = (await pool.query(
    `SELECT a.id, a.email, a.role, a.name, a.added_by, a.password_hash, a.last_login_at, a.removed_at, a.created_at,
            (SELECT COUNT(*) FROM admin_sessions s WHERE s.admin_id = a.id AND s.revoked_at IS NULL AND s.expires_at > ?) AS sessions
       FROM admin_accounts a ORDER BY a.created_at`,
    [now],
  )) as unknown as [Row[]];
  const order = { super: 0, admin: 1, support: 2 };
  const rank = (m: { role: AdminRole; status: string }) =>
    m.status === 'removed' ? 3 : order[m.role];
  return (
    rows
      // a row without a team role that is not a super admin was never on the team (an old ADMIN_EMAILS address)
      .filter((r) => r.role || superEmails.includes(r.email))
      .map((r) => {
        const role = roleOf(superEmails, r);
        return {
          id: r.id,
          email: r.email,
          name: r.name,
          role: role ?? (r.role as 'admin' | 'support'),
          status: !role
            ? ('removed' as const)
            : r.password_hash
              ? ('active' as const)
              : ('invited' as const),
          addedBy: r.added_by,
          lastLoginAt: r.last_login_at?.toISOString() ?? null,
          removedAt: r.removed_at?.toISOString() ?? null,
          createdAt: r.created_at.toISOString(),
          signedIn: Number(r.sessions) > 0,
        };
      })
      .sort((a, b) => rank(a) - rank(b))
  );
}

const page = (base: string | undefined) =>
  `${(base ?? 'https://tutor.chalkpis.com').replace(/\/$/, '')}/admin`;

function inviteMail(to: string, name: string, role: AdminRole, by: string, base?: string) {
  const link = page(base);
  const lines = [
    `Hello${name ? ` ${name}` : ''},`,
    `${by} added you to the Chalkpis admin dashboard as ${ROLE_LABEL[role]}.`,
    `To start: open ${link}, choose "First time? Set a password", and enter this email address (${to}). We email you a code; then choose your password.`,
    'Every sign-in asks for your password and a fresh code sent to this email. Keep both to yourself.',
  ];
  return {
    to,
    subject: 'You have been added to Chalkpis Admin',
    text: [...lines, '', 'Chalkpis Admin · M2W Technologies Private Limited'].join('\n'),
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#262626">${lines
      .map((l) => `<p style="font-size:14px;line-height:1.5">${l.replace(/[<>&]/g, '')}</p>`)
      .join(
        '',
      )}<p><a href="${link}" style="display:inline-block;background:#262626;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:14px">Open Chalkpis Admin</a></p>
<p style="font-size:12px;color:#a3a3a3;margin-top:24px">Chalkpis Admin · M2W Technologies Private Limited</p></div>`,
  };
}

/** Adds a member (or brings a removed one back with the new role) and emails them how to start. */
export async function addMember(
  pool: Pool,
  mailer: Mailer | null,
  superEmails: string[],
  by: string,
  input: z.infer<typeof memberBody>,
  publicBaseUrl?: string,
) {
  if (superEmails.includes(input.email)) throw new AppError(409, 'already_super_admin');
  const [found] = (await pool.query(
    'SELECT id, role, removed_at FROM admin_accounts WHERE email = ?',
    [input.email],
  )) as unknown as [{ id: string; role: string | null; removed_at: Date | null }[]];
  if (found[0]?.role && !found[0].removed_at) throw new AppError(409, 'already_member');
  const id = found[0]?.id ?? newId();
  if (found[0])
    await pool.query(
      'UPDATE admin_accounts SET role = ?, name = ?, added_by = ?, removed_at = NULL WHERE id = ?',
      [input.role, input.name, by, id],
    );
  else
    await pool.query(
      'INSERT INTO admin_accounts (id, email, role, name, added_by) VALUES (?, ?, ?, ?, ?)',
      [id, input.email, input.role, input.name, by],
    );
  const emailed = mailer
    ? await mailer.send(inviteMail(input.email, input.name, input.role, by, publicBaseUrl))
    : false;
  return { id, emailed };
}

async function member(pool: Pool, superEmails: string[], id: string) {
  const [rows] = (await pool.query(
    'SELECT id, email, role, name, removed_at FROM admin_accounts WHERE id = ?',
    [id],
  )) as unknown as [
    { id: string; email: string; role: string | null; name: string; removed_at: Date | null }[],
  ];
  const r = rows[0];
  if (!r) throw notFound();
  if (superEmails.includes(r.email)) throw new AppError(403, 'cannot_change_super_admin');
  if (!r.role) throw notFound(); // never on the team
  return { ...r, role: r.role };
}

export async function updateMember(
  pool: Pool,
  superEmails: string[],
  id: string,
  input: z.infer<typeof memberUpdate>,
) {
  const r = await member(pool, superEmails, id);
  if (r.removed_at) throw new AppError(409, 'member_removed');
  await pool.query('UPDATE admin_accounts SET role = ?, name = ? WHERE id = ?', [
    input.role ?? r.role,
    input.name ?? r.name,
    id,
  ]);
  return { email: r.email, role: input.role ?? r.role, before: r.role };
}

/** Removes a member: no access from the next click on, every session ended. The row stays for the audit log. */
export async function removeMember(pool: Pool, superEmails: string[], id: string, now: Date) {
  const r = await member(pool, superEmails, id);
  await pool.query('UPDATE admin_accounts SET removed_at = COALESCE(removed_at, ?) WHERE id = ?', [
    now,
    id,
  ]);
  await pool.query(
    'UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL',
    [now, id],
  );
  return { email: r.email };
}

/** Ends every session of one member (e.g. a lost laptop) without removing them. */
export async function signOutMember(pool: Pool, superEmails: string[], id: string, now: Date) {
  const r = await member(pool, superEmails, id);
  const [res] = (await pool.query(
    'UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL',
    [now, id],
  )) as unknown as [{ affectedRows: number }];
  return { email: r.email, ended: res.affectedRows };
}
