import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
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
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;

  app.put('/attendance', write, async (req) => {
    const r = await saveDay(
      deps.pool,
      inst(req),
      req.auth!.userId,
      parse(saveDayInput, req.body),
      now(),
    );
    return { id: r.id };
  });
  app.get('/attendance', read, async (req) => {
    const q = parse(dayQuery, req.query);
    return getDay(deps.pool, inst(req), q.batchId, q.date);
  });
  app.get('/attendance/range', read, async (req) => ({
    days: await listDays(deps.pool, inst(req), parse(rangeQuery, req.query)),
  }));
  app.get('/attendance/report', read, async (req) =>
    attendanceReport(deps.pool, inst(req), parse(rangeQuery, req.query)),
  );
  app.get('/students/:id/attendance', read, async (req) => {
    const q = parse(rangeQuery, req.query);
    return studentHistory(deps.pool, inst(req), idParam((req.params as { id: string }).id), q);
  });
}
