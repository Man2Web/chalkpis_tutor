import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate } from '../auth/guard.js';
import { deleteAccount } from '../account/service.js';
import type { BillingProvider } from '../billing/provider.js';
import { renewingWebSub } from '../billing/webSubscriptions.js';
import { AppError } from '../errors.js';
import { parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { billing?: BillingProvider | null; clock?: () => Date };
const body = z.object({ confirm: z.literal(true) });

export function accountRoutes(app: FastifyInstance, deps: Deps) {
  // Works even when the plan has expired: people must always be able to leave and take their data with them.
  app.delete(
    '/account',
    {
      preHandler: authenticate(deps),
      config: {
        rateLimit: {
          max: Math.max(5, Math.floor(deps.config.RATE_LIMIT_PER_MIN / 60)),
          timeWindow: '1 minute',
        },
      },
    },
    async (req) => {
      parse(body, req.body);
      const { userId, instituteId, role } = req.auth!;
      // An owner's website auto-renew (a Razorpay mandate) would keep charging after the centre is gone, and those
      // charges would land on no centre. Stop it at Razorpay first; if that is not possible, refuse rather than
      // delete (the admin deletion path refuses in the same case).
      if (role === 'owner' && instituteId) {
        const w = await renewingWebSub(deps.pool, instituteId);
        if (w) {
          if (!deps.billing?.cancelSubscription) throw new AppError(409, 'autorenew_on');
          try {
            await deps.billing.cancelSubscription(w.id, false);
          } catch (e) {
            throw Object.assign(new AppError(502, 'payment_provider_error'), { cause: e });
          }
          await deps.pool.query(
            "UPDATE web_subscriptions SET cancel_at_cycle_end = 1, status = 'cancelled' WHERE id = ?",
            [w.id],
          );
        }
      }
      return {
        ok: true,
        ...(await deleteAccount(deps.pool, deps.config.FILES_DIR, userId, deps.config.OTP_PEPPER)),
      };
    },
  );
}
