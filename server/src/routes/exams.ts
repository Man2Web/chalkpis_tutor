import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import {
  createExam,
  deleteExam,
  examInput,
  examPatch,
  examQuery,
  getExam,
  listExams,
  marksInput,
  saveMarks,
  studentExams,
  updateExam,
} from '../exams/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

/** Tests and marks (decision 151). Owner only: helpers take attendance and nothing else. */
export function examRoutes(app: FastifyInstance, deps: Deps) {
  const guard = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/exams', guard, async (req) => ({
    exams: await listExams(deps.pool, inst(req), parse(examQuery, req.query).batchId),
  }));
  app.post('/exams', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await createExam(deps.pool, inst(req), req.auth!.userId, parse(examInput, req.body), now()),
      ),
  );
  app.get('/exams/:id', guard, async (req) => getExam(deps.pool, inst(req), id(req)));
  app.patch('/exams/:id', guard, async (req) => {
    await updateExam(deps.pool, inst(req), id(req), parse(examPatch, req.body), now());
    return { ok: true };
  });
  app.delete('/exams/:id', guard, async (req) => {
    await deleteExam(deps.pool, inst(req), id(req));
    return { ok: true };
  });
  app.put('/exams/:id/marks', guard, async (req) =>
    saveMarks(deps.pool, inst(req), id(req), parse(marksInput, req.body), now()),
  );
  app.get('/students/:id/exams', guard, async (req) => ({
    exams: await studentExams(deps.pool, inst(req), id(req)),
  }));
}
