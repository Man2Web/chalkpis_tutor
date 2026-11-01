import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { idParam, parse } from '../lib/params.js';
import { studentInput } from '../students/schema.js';
import {
  addNote,
  convertEnquiry,
  createEnquiry,
  deleteEnquiry,
  enquiryInput,
  enquiryPatch,
  enquiryQuery,
  getEnquiry,
  listEnquiries,
  noteInput,
  updateEnquiry,
} from '../enquiries/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

/** Enquiries and admissions (decision 153). Owner only. */
export function enquiryRoutes(app: FastifyInstance, deps: Deps) {
  const guard = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/enquiries', guard, async (req) =>
    listEnquiries(deps.pool, inst(req), parse(enquiryQuery, req.query).status, now()),
  );
  app.post('/enquiries', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await createEnquiry(
          deps.pool,
          inst(req),
          req.auth!.userId,
          parse(enquiryInput, req.body),
          now(),
        ),
      ),
  );
  app.get('/enquiries/:id', guard, async (req) => getEnquiry(deps.pool, inst(req), id(req)));
  app.patch('/enquiries/:id', guard, async (req) => {
    await updateEnquiry(deps.pool, inst(req), id(req), parse(enquiryPatch, req.body), now());
    return { ok: true };
  });
  app.delete('/enquiries/:id', guard, async (req) => {
    await deleteEnquiry(deps.pool, inst(req), id(req));
    return { ok: true };
  });
  app.post('/enquiries/:id/notes', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await addNote(
          deps.pool,
          inst(req),
          req.auth!.userId,
          id(req),
          parse(noteInput, req.body).note,
          now(),
        ),
      ),
  );
  app.post('/enquiries/:id/convert', guard, async (req, reply) =>
    reply
      .code(201)
      .send(
        await convertEnquiry(deps.pool, inst(req), id(req), parse(studentInput, req.body), now()),
      ),
  );
}
