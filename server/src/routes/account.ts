import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate } from '../auth/guard.js';
import { deleteAccount } from '../account/service.js';
import { parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };
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
      return {
        ok: true,
        ...(await deleteAccount(deps.pool, deps.config.FILES_DIR, req.auth!.userId)),
      };
    },
  );
}
