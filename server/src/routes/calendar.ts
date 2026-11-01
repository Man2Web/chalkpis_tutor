import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import {
  calendarRange,
  createEvent,
  deleteEvent,
  eventInput,
  eventPatch,
  getEvent,
  rangeQuery,
  updateEvent,
} from '../calendar/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

/** The centre's calendar (decision 154). Owner only. */
export function calendarRoutes(app: FastifyInstance, deps: Deps) {
  const guard = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/calendar', guard, async (req) => {
    const q = parse(rangeQuery, req.query);
    return calendarRange(deps.pool, inst(req), q.from, q.to);
  });
  app.post('/calendar/events', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await createEvent(
          deps.pool,
          inst(req),
          req.auth!.userId,
          parse(eventInput, req.body),
          now(),
        ),
      ),
  );
  app.get('/calendar/events/:id', guard, async (req) => getEvent(deps.pool, inst(req), id(req)));
  app.patch('/calendar/events/:id', guard, async (req) => {
    await updateEvent(deps.pool, inst(req), id(req), parse(eventPatch, req.body), now());
    return { ok: true };
  });
  app.delete('/calendar/events/:id', guard, async (req) => {
    await deleteEvent(deps.pool, inst(req), id(req));
    return { ok: true };
  });
}
