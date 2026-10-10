import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { logoUrl } from './files.js';
import { activeCount } from '../institutes/limits.js';
import { createInstitute, isPlanActive } from '../institutes/service.js';

const createBody = z.object({
  tutorName: z.string().trim().min(2).max(80),
  instituteName: z.string().trim().min(2).max(120),
  language: z.enum(['en', 'hi']).default('en'),
});
const patchBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    address: z.string().trim().max(255),
    phone: z.string().trim().max(20),
    receiptPrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{2,6}$/),
    // name@bank; empty clears it
    upiId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^([a-z0-9._-]{2,50}@[a-z][a-z0-9]{1,30})?$/),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

export function instituteRoutes(app: FastifyInstance, deps: Deps) {
  const auth = authenticate(deps);
  const now = () => (deps.clock ?? (() => new Date()))();

  app.post('/institutes', { preHandler: auth }, async (req, reply) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    const r = await createInstitute(
      deps.pool,
      req.auth!.userId,
      body.data,
      now(),
      deps.config.TRIAL_DAYS,
    );
    return reply.code(r.created ? 201 : 200).send(r);
  });

  // The institute is always the caller's own, taken from their membership; there is no id in the URL to tamper with.
  app.get('/institute', { preHandler: [auth, requireInstitute] }, async (req) => {
    const [rows] = (await deps.pool.query(
      'SELECT name, address, phone, upi_id, receipt_prefix, timezone, currency, logo_path FROM institutes WHERE id = ?',
      [req.auth!.instituteId],
    )) as unknown as [
      {
        name: string;
        address: string;
        phone: string;
        upi_id: string;
        receipt_prefix: string;
        timezone: string;
        currency: string;
        logo_path: string | null;
      }[],
    ];
    const r = rows[0]!;
    return {
      name: r.name,
      address: r.address,
      phone: r.phone,
      upiId: r.upi_id,
      receiptPrefix: r.receipt_prefix,
      timezone: r.timezone,
      currency: r.currency,
      logoUrl: logoUrl(deps.config.PUBLIC_BASE_URL, r.logo_path),
    };
  });

  app.patch('/institute', { preHandler: [auth, requireOwner] }, async (req, reply) => {
    const body = patchBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'bad_request' });
    if (!(await isPlanActive(deps.pool, req.auth!.instituteId!, now())))
      return reply.code(402).send({ error: 'plan_expired' });
    const b = body.data;
    await deps.pool.query(
      'UPDATE institutes SET name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone), upi_id = COALESCE(?, upi_id), receipt_prefix = COALESCE(?, receipt_prefix) WHERE id = ?',
      [
        b.name ?? null,
        b.address ?? null,
        b.phone ?? null,
        b.upiId ?? null,
        b.receiptPrefix ?? null,
        req.auth!.instituteId,
      ],
    );
    return { ok: true };
  });

  app.post('/me/onboarding-complete', { preHandler: [auth, requireInstitute] }, async (req) => {
    await deps.pool.query('UPDATE memberships SET onboarding_done = 1 WHERE user_id = ?', [
      req.auth!.userId,
    ]);
    return { ok: true };
  });

  app.get('/subscription', { preHandler: [auth, requireInstitute] }, async (req) => {
    const [rows] = (await deps.pool.query(
      'SELECT plan, status, starts_at, expires_at, student_limit, batch_limit FROM subscriptions WHERE institute_id = ?',
      [req.auth!.instituteId],
    )) as unknown as [
      {
        plan: string;
        status: string;
        starts_at: Date;
        expires_at: Date;
        student_limit: number | null;
        batch_limit: number | null;
      }[],
    ];
    const s = rows[0]!;
    return {
      plan: s.plan,
      status: s.status,
      startsAt: s.starts_at,
      expiresAt: s.expires_at,
      studentLimit: s.student_limit,
      batchLimit: s.batch_limit,
      active: s.status === 'active' && s.expires_at.getTime() > now().getTime(),
      usage: {
        students: await activeCount(deps.pool, 'students', req.auth!.instituteId!),
        batches: await activeCount(deps.pool, 'batches', req.auth!.instituteId!),
      },
    };
  });
}
