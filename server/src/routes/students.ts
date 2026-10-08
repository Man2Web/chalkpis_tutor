import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import { bulkInput, listQuery, studentInput, studentPatch } from '../students/schema.js';
import {
  createStudents,
  getStudent,
  listStudents,
  setStudentStatus,
  updateStudent,
} from '../students/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

export function studentRoutes(app: FastifyInstance, deps: Deps) {
  const read = { preHandler: [authenticate(deps), requireInstitute] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;

  app.get('/students', read, async (req) => ({
    students: await listStudents(deps.pool, inst(req), parse(listQuery, req.query)),
  }));
  app.get('/students/:id', read, async (req) =>
    getStudent(deps.pool, inst(req), idParam((req.params as { id: string }).id)),
  );

  app.post('/students', write, async (req, reply) => {
    const [id] = await createStudents(deps.pool, inst(req), [parse(studentInput, req.body)], now());
    return reply.code(201).send({ id });
  });
  // Import: all rows or none, so a half-imported list can never happen.
  app.post('/students/bulk', { ...write, bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const ids = await createStudents(
      deps.pool,
      inst(req),
      parse(bulkInput, req.body).students,
      now(),
    );
    return reply.code(201).send({ ids });
  });
  app.patch('/students/:id', write, async (req) => {
    await updateStudent(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      parse(studentPatch, req.body),
      now(),
    );
    return { ok: true };
  });
  app.post('/students/:id/deactivate', write, async (req) => {
    await setStudentStatus(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      'inactive',
      now(),
    );
    return { ok: true };
  });
  app.post('/students/:id/reactivate', write, async (req) => {
    await setStudentStatus(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      'active',
      now(),
    );
    return { ok: true };
  });
}
