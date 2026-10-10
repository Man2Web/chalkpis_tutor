import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { todayYmd } from '../lib/ist.js';
import { idParam, parse } from '../lib/params.js';
import {
  addTask,
  deleteTask,
  listTasks,
  taskInput,
  taskPatch,
  taskQuery,
  updateTask,
} from '../tasks/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

/** The tutor's own to-do list on Home. Owner only. */
export function taskRoutes(app: FastifyInstance, deps: Deps) {
  const guard = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/tasks', guard, async (req) => {
    const q = parse(taskQuery, req.query);
    return { tasks: await listTasks(deps.pool, inst(req), q.date ?? todayYmd(now())) };
  });
  app.post('/tasks', guard, async (req, reply) =>
    reply.code(201).send(await addTask(deps.pool, inst(req), parse(taskInput, req.body), now())),
  );
  app.patch('/tasks/:id', guard, async (req) => {
    await updateTask(deps.pool, inst(req), id(req), parse(taskPatch, req.body), now());
    return { ok: true };
  });
  app.delete('/tasks/:id', guard, async (req) => {
    await deleteTask(deps.pool, inst(req), id(req));
    return { ok: true };
  });
}
