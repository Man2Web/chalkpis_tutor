import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import {
  checksInput,
  createHomework,
  deleteHomework,
  getHomework,
  homeworkInput,
  homeworkPatch,
  homeworkQuery,
  listHomework,
  saveChecks,
  studentHomework,
  updateHomework,
} from '../homework/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

/** Homework (decision 152). Owner only, like tests: helpers take attendance and nothing else. */
export function homeworkRoutes(app: FastifyInstance, deps: Deps) {
  const guard = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/homework', guard, async (req) => ({
    homework: await listHomework(deps.pool, inst(req), parse(homeworkQuery, req.query).batchId),
  }));
  app.post('/homework', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await createHomework(
          deps.pool,
          inst(req),
          req.auth!.userId,
          parse(homeworkInput, req.body),
          now(),
        ),
      ),
  );
  app.get('/homework/:id', guard, async (req) => getHomework(deps.pool, inst(req), id(req)));
  app.patch('/homework/:id', guard, async (req) => {
    await updateHomework(deps.pool, inst(req), id(req), parse(homeworkPatch, req.body), now());
    return { ok: true };
  });
  app.delete('/homework/:id', guard, async (req) => {
    await deleteHomework(deps.pool, inst(req), id(req));
    return { ok: true };
  });
  app.put('/homework/:id/checks', guard, async (req) =>
    saveChecks(deps.pool, inst(req), id(req), parse(checksInput, req.body), now()),
  );
  app.get('/students/:id/homework', guard, async (req) => ({
    homework: await studentHomework(deps.pool, inst(req), id(req)),
  }));
}
