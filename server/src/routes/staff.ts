import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import { normalizeIndianPhone } from '../lib/phone.js';
import { addStaff, listStaff, removeStaff, setStaffBatches } from '../staff/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

const phone = z
  .string()
  .max(32)
  .transform((v, ctx) => {
    const p = normalizeIndianPhone(v);
    if (!p) ctx.addIssue({ code: 'custom', message: 'phone' });
    return p ?? '';
  });
const ids = z.array(z.string().uuid()).max(50);
const addBody = z.object({
  phone,
  name: z.string().trim().min(2).max(80),
  batchIds: ids.default([]),
});
const batchesBody = z.object({ batchIds: ids });

export function staffRoutes(app: FastifyInstance, deps: Deps) {
  const owner = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const uid = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/staff', owner, async (req) => ({ staff: await listStaff(deps.pool, inst(req)) }));
  app.post('/staff', owner, async (req, reply) =>
    reply
      .code(201)
      .send({ id: await addStaff(deps.pool, inst(req), parse(addBody, req.body), now()) }),
  );
  app.put('/staff/:id/batches', owner, async (req) => {
    await setStaffBatches(
      deps.pool,
      inst(req),
      uid(req),
      parse(batchesBody, req.body).batchIds,
      now(),
    );
    return { ok: true };
  });
  app.delete('/staff/:id', owner, async (req) => {
    await removeStaff(deps.pool, inst(req), uid(req));
    return { ok: true };
  });
}
