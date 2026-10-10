import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { requireActivePlan } from '../institutes/limits.js';
import {
  advanceInput,
  chargeInput,
  discountInput,
  duesQuery,
  generateInput,
  paymentInput,
  paymentsQuery,
  rangeQuery,
  waiveInput,
} from '../fees/schema.js';
import {
  addCharge,
  feesOverview,
  generateDues,
  getDue,
  getPayment,
  listDues,
  listPayments,
  recordAdvance,
  recordPayment,
  reversePayment,
  setDiscount,
  setWaived,
} from '../fees/service.js';
import { currentPeriod } from '../lib/ist.js';
import { idParam, parse } from '../lib/params.js';
import { z } from 'zod';
import { dashboard, feesHistory, feesReport } from '../reports/service.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

export function feeRoutes(app: FastifyInstance, deps: Deps) {
  // Money, dashboard and reports are the owner's only: staff only take attendance.
  const read = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);

  app.get('/dashboard', read, async (req) => dashboard(deps.pool, inst(req), now()));
  app.get('/reports/fees', read, async (req) =>
    feesReport(deps.pool, inst(req), parse(rangeQuery, req.query)),
  );

  app.get('/reports/fees-history', read, async (req) => {
    const q = parse(
      z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }),
      req.query,
    );
    return feesHistory(deps.pool, inst(req), q.months, now());
  });
  app.get('/fees/overview', read, async (req) => feesOverview(deps.pool, inst(req), now()));
  app.get('/fees/dues', read, async (req) => ({
    dues: await listDues(deps.pool, inst(req), parse(duesQuery, req.query), now()),
  }));
  app.get('/fees/dues/:id', read, async (req) => getDue(deps.pool, inst(req), id(req), now()));
  app.get('/fees/payments', read, async (req) => ({
    payments: await listPayments(deps.pool, inst(req), parse(paymentsQuery, req.query)),
  }));
  app.get('/fees/payments/:id', read, async (req) => getPayment(deps.pool, inst(req), id(req)));

  app.post('/fees/generate', write, async (req) => {
    const { period } = parse(generateInput, req.body ?? {});
    await requireActivePlan(deps.pool, inst(req), now());
    return { created: await generateDues(deps.pool, inst(req), period ?? currentPeriod(now())) };
  });
  app.post('/fees/dues/:id/payments', write, async (req, reply) =>
    reply
      .code(201)
      .send(
        await recordPayment(
          deps.pool,
          inst(req),
          req.auth!.userId,
          id(req),
          parse(paymentInput, req.body),
          now(),
        ),
      ),
  );
  app.post('/fees/advance', write, async (req, reply) =>
    reply
      .code(201)
      .send(
        await recordAdvance(
          deps.pool,
          inst(req),
          req.auth!.userId,
          parse(advanceInput, req.body),
          now(),
        ),
      ),
  );
  app.post('/fees/payments/:id/reverse', write, async (req) =>
    reversePayment(deps.pool, inst(req), req.auth!.userId, id(req), now()),
  );
  app.post('/fees/charges', write, async (req, reply) =>
    reply
      .code(201)
      .send({ id: await addCharge(deps.pool, inst(req), parse(chargeInput, req.body), now()) }),
  );
  app.patch('/fees/dues/:id/discount', write, async (req) => {
    await setDiscount(
      deps.pool,
      inst(req),
      id(req),
      parse(discountInput, req.body).discount,
      now(),
    );
    return { ok: true };
  });
  app.post('/fees/dues/:id/waive', write, async (req) => {
    const b = parse(waiveInput, req.body);
    await setWaived(deps.pool, inst(req), id(req), b.waived, b.note, now());
    return { ok: true };
  });
}
