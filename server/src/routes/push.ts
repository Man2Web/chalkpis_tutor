import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate } from '../auth/guard.js';
import { parse } from '../lib/params.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

const token = z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/);
const body = z.object({ token, platform: z.enum(['ios', 'android']) });

/** The app registers its push token after sign-in (and drops it at sign-out). A device belongs to its last user. */
export function pushRoutes(app: FastifyInstance, deps: Deps) {
  const now = () => (deps.clock ?? (() => new Date()))();
  app.post('/me/push-token', { preHandler: authenticate(deps) }, async (req, reply) => {
    const b = parse(body, req.body);
    await deps.pool.query(
      `INSERT INTO push_tokens (token, user_id, platform, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), last_seen_at = VALUES(last_seen_at)`,
      [b.token, req.auth!.userId, b.platform, now(), now()],
    );
    return reply.code(204).send();
  });
  app.post('/me/push-token/remove', { preHandler: authenticate(deps) }, async (req, reply) => {
    const { token: t } = parse(z.object({ token }), req.body);
    await deps.pool.query('DELETE FROM push_tokens WHERE token = ? AND user_id = ?', [
      t,
      req.auth!.userId,
    ]);
    return reply.code(204).send();
  });
}
