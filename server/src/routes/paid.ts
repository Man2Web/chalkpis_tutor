import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { readId } from '../billing/payLink.js';
import { withTransaction } from '../db.js';
import { notFound } from '../errors.js';
import { payReported } from '../fees/service.js';
import { requireActivePlan } from '../institutes/limits.js';
import { newId } from '../lib/ids.js';
import { idParam } from '../lib/params.js';
import { rupees } from '../messaging/templates.js';
import { PAY_CSS_HREF } from './payCss.js';
import { ownerOf, pushToUsers } from '../push/expo.js';

type Deps = Pick<AppDeps, 'config' | 'pool' | 'push'> & { clock?: () => Date };

const CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const day = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

interface Student {
  id: string;
  institute_id: string;
  name: string;
  centre: string;
  owe: number;
}
interface Report {
  id: string;
  amount: number;
  created_at: Date;
}

/** What a student owes now: the open dues (amount - discount - paid), never negative. */
const OWE_SQL = `COALESCE((SELECT SUM(GREATEST(CAST(d.amount AS SIGNED) - CAST(d.discount AS SIGNED) - CAST(d.paid AS SIGNED), 0))
  FROM fee_dues d WHERE d.institute_id = s.institute_id AND d.student_id = s.id AND d.status IN ('pending','partial')), 0)`;

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="${PAY_CSS_HREF}"></head><body><main>${body}<footer>Sent through Chalkpis on behalf of your centre. Payments go straight to the centre; Chalkpis never handles fee money.</footer></main></body></html>`;

/**
 * "I've paid": the link in a fee reminder (tutor.chalkpis.com/f/<token>, one per student) where a parent says they paid
 * the tutor directly. They are thanked at once; the tutor sees it in the app and confirms it (the payment is recorded
 * and the WhatsApp receipt goes out) or marks it not received. A parent can only report; nothing is recorded until the
 * tutor confirms.
 */
export function paidRoutes(app: FastifyInstance, deps: Deps) {
  const { pool, config } = deps;
  const now = () => (deps.clock ?? (() => new Date()))();
  const owner = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const send = (reply: FastifyReply, code: number, html: string) =>
    reply
      .code(code)
      .header('Content-Security-Policy', CSP)
      .header('Referrer-Policy', 'no-referrer')
      .header('X-Robots-Tag', 'noindex, nofollow')
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(html);

  const load = async (token: string) => {
    const id = readId(config.JWT_SECRET, 'paid', token);
    if (!id) return null;
    const [rows] = (await pool.query(
      `SELECT s.id, s.institute_id, s.name, i.name AS centre, ${OWE_SQL} AS owe
         FROM students s JOIN institutes i ON i.id = s.institute_id WHERE s.id = ?`,
      [id],
    )) as unknown as [Student[]];
    const s = rows[0];
    if (!s) return null;
    const [open] = (await pool.query(
      "SELECT id, amount, created_at FROM payment_reports WHERE student_id = ? AND status = 'pending'",
      [s.id],
    )) as unknown as [Report[]];
    return { s: { ...s, owe: Number(s.owe) }, open: open[0] ?? null };
  };
  const gone = (reply: FastifyReply) =>
    send(
      reply,
      404,
      page(
        'Link not found',
        '<h1>This link does not work</h1><p>Please contact your centre directly.</p>',
      ),
    );
  const view = (s: Student, open: Report | null, note = '') => {
    const head = `<h1>${esc(s.name)}</h1><p class="centre">${esc(s.centre)}</p>${note}`;
    if (open)
      return page(
        'Payment reported',
        `${head}<p class="status">You told ${esc(s.centre)} on ${day(open.created_at)} that you paid ${rupees(Number(open.amount))}. They will confirm it soon, and the receipt will come to you on WhatsApp.</p>`,
      );
    if (s.owe <= 0)
      return page(
        'Nothing pending',
        `${head}<p class="status">Nothing is pending right now. Thank you!</p>`,
      );
    return page(
      'Fees',
      `${head}<p class="status">${rupees(s.owe)} is pending.</p>
<form class="signin" method="post"><label for="ref">UPI transaction ID (optional)</label><input id="ref" name="ref" inputmode="numeric" maxlength="40" placeholder="12-digit UPI reference" autocomplete="off"><button type="submit">I've paid ${rupees(s.owe)}</button></form>
<p class="small">Only tap this after paying ${esc(s.centre)}. They will check and confirm it.</p>`,
    );
  };

  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string', bodyLimit: 1024 },
      (_req, body, done) => done(null, body),
    );
    scope.get<{ Params: { token: string } }>('/f/:token', async (req, reply) => {
      const r = await load(req.params.token);
      return r ? send(reply, 200, view(r.s, r.open)) : gone(reply);
    });
    scope.post<{ Params: { token: string } }>(
      '/f/:token',
      { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } },
      async (req, reply) => {
        const r = await load(req.params.token);
        if (!r) return gone(reply);
        if (r.open || r.s.owe <= 0) return send(reply, 200, view(r.s, r.open));
        const ref = (
          new URLSearchParams(typeof req.body === 'string' ? req.body : '').get('ref') ?? ''
        )
          .replace(/[^A-Za-z0-9-]/g, '')
          .slice(0, 40);
        // the dues this report is about: confirming later pays only these, never a fee added after
        const [open] = (await pool.query(
          "SELECT id FROM fee_dues WHERE institute_id = ? AND student_id = ? AND status IN ('pending','partial')",
          [r.s.institute_id, r.s.id],
        )) as unknown as [{ id: string }[]];
        // INSERT IGNORE: a double tap (or two parents at once) still makes one pending report
        const reportId = newId();
        const [ins] = (await pool.query(
          `INSERT IGNORE INTO payment_reports (id, institute_id, student_id, amount, due_ids, upi_ref, open_key, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportId,
            r.s.institute_id,
            r.s.id,
            r.s.owe,
            open.map((d) => d.id).join(','),
            ref,
            r.s.id,
            now(),
          ],
        )) as unknown as [{ affectedRows: number }];
        if (ins.affectedRows === 1)
          void pushToUsers(
            pool,
            deps.push ?? null,
            await ownerOf(pool, r.s.institute_id),
            `paid_${reportId}`,
            {
              title: 'Payment reported',
              body: `${r.s.name}'s parent says they paid ${rupees(r.s.owe)}. Tap to confirm.`,
              screen: 'Home',
            },
          );
        const after = await load(req.params.token);
        return send(
          reply,
          200,
          view(r.s, after?.open ?? null, '<p class="note">Thank you! We have told the centre.</p>'),
        );
      },
    );
  });

  // ---- the tutor's side (the app) ----

  app.get('/fees/reports', owner, async (req) => {
    const [rows] = (await pool.query(
      `SELECT r.id, r.student_id, s.name, r.amount, r.upi_ref, r.created_at, ${OWE_SQL} AS owe
         FROM payment_reports r JOIN students s ON s.id = r.student_id
        WHERE r.institute_id = ? AND r.status = 'pending' ORDER BY r.created_at`,
      [req.auth!.instituteId],
    )) as unknown as [
      {
        id: string;
        student_id: string;
        name: string;
        amount: number;
        upi_ref: string;
        created_at: Date;
        owe: number;
      }[],
    ];
    return {
      reports: rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.name,
        amountPaise: Number(r.amount),
        owePaise: Number(r.owe),
        upiRef: r.upi_ref,
        reportedAt: r.created_at.toISOString(),
      })),
    };
  });

  const decide = async (instituteId: string, userId: string, id: string, confirm: boolean) => {
    if (confirm) await requireActivePlan(pool, instituteId, now());
    return withTransaction(pool, async (c) => {
      const [rows] = (await c.query(
        "SELECT id, student_id, amount, due_ids, upi_ref FROM payment_reports WHERE id = ? AND institute_id = ? AND status = 'pending' FOR UPDATE",
        [id, instituteId],
      )) as unknown as [
        { id: string; student_id: string; amount: number; due_ids: string | null; upi_ref: string }[],
      ];
      const r = rows[0];
      if (!r) throw notFound();
      let paid = { total: 0, receipts: [] as string[] };
      if (confirm) {
        paid = await payReported(
          c,
          instituteId,
          userId,
          {
            studentId: r.student_id,
            amount: Number(r.amount),
            // reports from before due_ids existed (NULL) keep paying the oldest open dues
            dueIds: r.due_ids === null ? null : r.due_ids.split(',').filter(Boolean),
            note: `Parent reported paying${r.upi_ref ? ` (UPI ref ${r.upi_ref})` : ''}`,
          },
          now(),
        );
        // nothing owed any more (the tutor recorded it by hand): confirming just closes the report
      }
      await c.query(
        'UPDATE payment_reports SET status = ?, open_key = NULL, decided_at = ?, decided_by = ? WHERE id = ?',
        [confirm ? 'confirmed' : 'rejected', now(), userId, r.id],
      );
      return { ok: true, paidPaise: paid.total, receipts: paid.receipts };
    });
  };
  app.post('/fees/reports/:id/confirm', owner, async (req) =>
    decide(
      req.auth!.instituteId!,
      req.auth!.userId,
      idParam((req.params as { id: string }).id),
      true,
    ),
  );
  app.post('/fees/reports/:id/reject', owner, async (req) =>
    decide(
      req.auth!.instituteId!,
      req.auth!.userId,
      idParam((req.params as { id: string }).id),
      false,
    ),
  );
}
