import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute } from '../auth/guard.js';
import { AppError, notFound } from '../errors.js';
import { addDays, todayYmd } from '../lib/ist.js';
import { batchScope } from '../staff/service.js';
import { dayQuery, saveDayInput } from '../attendance/schema.js';
import {
  attendanceReport,
  getDay,
  listDays,
  saveDay,
  studentHistory,
} from '../attendance/service.js';
import { rangeQuery } from '../fees/schema.js';
import { idParam, parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

export function attendanceRoutes(app: FastifyInstance, deps: Deps) {
  const read = { preHandler: [authenticate(deps), requireInstitute] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;

  // Taking attendance is open to the owner and to staff, but staff only for their assigned batches, only for today and
  // yesterday, and only for students who are in that batch. Everything else about a batch answers like a missing one.
  app.put('/attendance', read, async (req) => {
    const body = parse(saveDayInput, req.body);
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope) {
      if (!scope.includes(body.batchId)) throw notFound();
      if (body.date < addDays(todayYmd(now()), -1)) throw new AppError(403, 'staff_date_limit');
      const ids = Object.keys(body.marks);
      if (ids.length) {
        const [rows] = (await deps.pool.query(
          'SELECT COUNT(*) AS n FROM student_batches WHERE institute_id = ? AND batch_id = ? AND student_id IN (?)',
          [inst(req), body.batchId, ids],
        )) as unknown as [{ n: number }[]];
        if (Number(rows[0]?.n) !== ids.length) throw new AppError(400, 'unknown_student');
      }
    }
    const r = await saveDay(deps.pool, inst(req), req.auth!.userId, body, now());
    return { id: r.id };
  });
  app.get('/attendance', read, async (req) => {
    const q = parse(dayQuery, req.query);
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope && !scope.includes(q.batchId)) throw notFound();
    return getDay(deps.pool, inst(req), q.batchId, q.date);
  });
  app.get('/attendance/range', read, async (req) => {
    const q = parse(rangeQuery, req.query);
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope && q.batchId && !scope.includes(q.batchId)) throw notFound();
    return { days: await listDays(deps.pool, inst(req), q, scope) };
  });
  app.get('/attendance/report', read, async (req) => {
    const q = parse(rangeQuery, req.query);
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope && q.batchId && !scope.includes(q.batchId)) throw notFound();
    return attendanceReport(deps.pool, inst(req), q, scope);
  });
  app.get('/students/:id/attendance', read, async (req) => {
    const q = parse(rangeQuery, req.query);
    const id = idParam((req.params as { id: string }).id);
    const scope = await batchScope(deps.pool, req.auth!);
    if (scope) await requireStudentInScope(id, scope);
    return studentHistory(deps.pool, inst(req), id, q, scope);
  });

  async function requireStudentInScope(studentId: string, scope: string[]) {
    const [rows] = (await deps.pool.query(
      'SELECT 1 FROM student_batches WHERE student_id = ? AND batch_id IN (?) LIMIT 1',
      [studentId, scope.length ? scope : ['']],
    )) as unknown as [unknown[]];
    if (!rows.length) throw notFound();
  }
}
