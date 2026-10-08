import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { batchInput, batchPatch, studentIds } from '../batches/schema.js';
import {
  addStudentsToBatch,
  createBatch,
  getBatch,
  listBatches,
  removeStudentFromBatch,
  setBatchStatus,
  updateBatch,
} from '../batches/service.js';
import { idParam, parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };
const listQuery = z.object({ status: z.enum(['active', 'archived', 'all']).default('active') });

export function batchRoutes(app: FastifyInstance, deps: Deps) {
  const read = { preHandler: [authenticate(deps), requireInstitute] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;

  app.get('/batches', read, async (req) => ({
    batches: await listBatches(deps.pool, inst(req), parse(listQuery, req.query).status),
  }));
  app.get('/batches/:id', read, async (req) =>
    getBatch(deps.pool, inst(req), idParam((req.params as { id: string }).id)),
  );

  app.post('/batches', write, async (req, reply) => {
    const id = await createBatch(deps.pool, inst(req), parse(batchInput, req.body), now());
    return reply.code(201).send({ id });
  });
  app.patch('/batches/:id', write, async (req) => {
    await updateBatch(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      parse(batchPatch, req.body),
      now(),
    );
    return { ok: true };
  });
  app.post('/batches/:id/archive', write, async (req) => {
    await setBatchStatus(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      'archived',
      now(),
    );
    return { ok: true };
  });
  app.post('/batches/:id/restore', write, async (req) => {
    await setBatchStatus(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      'active',
      now(),
    );
    return { ok: true };
  });
  app.post('/batches/:id/students', write, async (req) => {
    await addStudentsToBatch(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      parse(studentIds, req.body).studentIds,
      now(),
    );
    return { ok: true };
  });
  app.delete('/batches/:id/students/:studentId', write, async (req) => {
    const p = req.params as { id: string; studentId: string };
    await removeStudentFromBatch(deps.pool, inst(req), idParam(p.id), idParam(p.studentId), now());
    return { ok: true };
  });
}
