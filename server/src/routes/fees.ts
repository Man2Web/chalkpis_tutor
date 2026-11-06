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
  planInput,
  rangeQuery,
  waiveInput,
} from '../fees/schema.js';
import {
  addCharge,
  createFeePlans,
  feesOverview,
  generateDues,
  getDue,
  getPayment,
  listDues,
  listPayments,
  recordAdvance,
  recordPayment,
  removeFeePlan,
  reversePayment,
  setDiscount,
  setWaived,
} from '../fees/service.js';
import { currentPeriod } from '../lib/ist.js';
import { AppError } from '../errors.js';

/** Whole months from `from` to `to` (both YYYY-MM): positive when `to` is later. */
const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
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
    // A month far from today makes no sense for fees, and generating month after month would multiply a centre's
    // open dues (which reminders and the overview load in full): 24 months back to 12 ahead.
    const cur = currentPeriod(now());
    if (period && Math.abs(monthsBetween(cur, period) + 6) > 18)
      throw new AppError(400, 'bad_request', { field: 'period' });
    await requireActivePlan(deps.pool, inst(req), now());
    return { created: await generateDues(deps.pool, inst(req), period ?? cur) };
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
  app.post('/fees/plans', write, async (req, reply) =>
    reply
      .code(201)
      .send(
        await createFeePlans(
          deps.pool,
          inst(req),
          req.auth!.userId,
          parse(planInput, req.body),
          now(),
        ),
      ),
  );
  app.delete('/fees/plans/:id', write, async (req) =>
    removeFeePlan(deps.pool, inst(req), id(req), now()),
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
