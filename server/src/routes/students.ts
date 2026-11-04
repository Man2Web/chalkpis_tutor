import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { z } from 'zod';
import { AppError, notFound as missing } from '../errors.js';
import { idParam, parse } from '../lib/params.js';
import { batchScope } from '../staff/service.js';
import { bulkInput, listQuery, studentInput, studentPatch } from '../students/schema.js';
import {
  createStudents,
  getStudent,
  listStudents,
  setStudentStatus,
  staffView,
  updateStudent,
} from '../students/service.js';
import { familyOf, linkInput, linkSiblings, unlinkSibling } from '../students/family.js';

/** A new student can be added as a brother or sister of one already here (decision 155). */
const siblingOf = z.object({ familyWith: z.string().uuid().optional() });

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

export function studentRoutes(app: FastifyInstance, deps: Deps) {
  const read = { preHandler: [authenticate(deps), requireInstitute] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;

  // Staff see only the students of their assigned batches.
  app.get('/students', read, async (req) => {
    const q = parse(listQuery, req.query);
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope && q.batchId && !scope.includes(q.batchId)) return { students: [] };
    const students = await listStudents(deps.pool, inst(req), q, scope);
    return { students: scope ? students.map(staffView) : students };
  });
  app.get('/students/:id', read, async (req) => {
    const s = await getStudent(deps.pool, inst(req), idParam((req.params as { id: string }).id));
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope && !s.batchIds.some((b) => scope.includes(b))) throw missing();
    return scope ? staffView(s) : s;
  });

  app.post('/students', write, async (req, reply) => {
    const input = parse(studentInput, req.body);
    const { familyWith } = parse(siblingOf, req.body);
    // checked first, so a mistyped brother or sister never leaves a half-done student behind
    if (familyWith)
      await getStudent(deps.pool, inst(req), familyWith).catch(() => {
        throw new AppError(400, 'unknown_sibling');
      });
    const [id] = await createStudents(deps.pool, inst(req), [input], now(), { welcome: true });
    if (familyWith) await linkSiblings(deps.pool, inst(req), id!, familyWith, now());
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
  // Brothers and sisters (decision 155): owner only, since it shows each child's fees.
  app.get('/students/:id/family', write, async (req) =>
    familyOf(deps.pool, inst(req), idParam((req.params as { id: string }).id), now()),
  );
  app.post('/students/:id/family', write, async (req) => {
    const { studentId } = parse(linkInput, req.body);
    return linkSiblings(
      deps.pool,
      inst(req),
      idParam((req.params as { id: string }).id),
      studentId,
      now(),
    );
  });
  app.delete('/students/:id/family', write, async (req) => {
    await unlinkSibling(deps.pool, inst(req), idParam((req.params as { id: string }).id), now());
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
