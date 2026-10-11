import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Pool } from './db.js';
import { verifyToken } from './lib/jwt.js';

/**
 * Safe retries for create and money requests. When a signed-in request carries an `Idempotency-Key` header, the
 * first one does the work and its answer is stored; the same key again (a double tap, a retry after a timeout)
 * gets that stored answer back, marked `Idempotent-Replayed: true`, and nothing is done twice. A repeat that
 * arrives while the first is still running gets 409 `request_in_progress` (try again in a moment). The same key on
 * a different route is refused (422). Keys live 24 hours.
 *
 * Only clear outcomes are stored: success, and errors that would come out the same again (400, 404, 409, 410,
 * 422). Anything else (401 before a token refresh, 403, 429, 5xx) frees the key so a retry runs for real.
 */

const KEY = /^[A-Za-z0-9_-]{16,100}$/;
const STORED_ERRORS = new Set([400, 404, 409, 410, 422]);
export const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;

interface Claim {
  userId: string;
  key: string;
}
declare module 'fastify' {
  interface FastifyRequest {
    idem?: Claim;
  }
}

const routeOf = (req: FastifyRequest) => `${req.method} ${req.routeOptions.url ?? req.url}`;

export function idempotency(
  app: FastifyInstance,
  pool: Pool,
  config: Pick<Config, 'JWT_SECRET'>,
  clock?: () => Date,
) {
  const now = () => (clock ?? (() => new Date()))();

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const raw = req.headers['idempotency-key'];
    if (raw === undefined) return;
    if (typeof raw !== 'string' || !KEY.test(raw))
      return reply.code(400).send({ error: 'bad_idempotency_key' });
    // who is asking (the route itself still checks the token properly); unsigned requests are not covered
    const auth = req.headers.authorization;
    const claims = verifyToken(
      typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null,
      config.JWT_SECRET,
      now().getTime(),
    );
    if (!claims) return;
    const route = routeOf(req);
    const [ins] = (await pool.query(
      'INSERT IGNORE INTO idempotency_keys (user_id, idem_key, route, created_at) VALUES (?, ?, ?, ?)',
      [claims.sub, raw, route, now()],
    )) as unknown as [{ affectedRows: number }];
    if (ins.affectedRows === 1) {
      req.idem = { userId: claims.sub, key: raw };
      return;
    }
    const [rows] = (await pool.query(
      'SELECT route, status, body, created_at FROM idempotency_keys WHERE user_id = ? AND idem_key = ?',
      [claims.sub, raw],
    )) as unknown as [
      { route: string; status: number | null; body: string | null; created_at: Date }[],
    ];
    const prev = rows[0];
    // an old key from yesterday: forget it and run this request as new
    if (prev && now().getTime() - prev.created_at.getTime() > IDEMPOTENCY_TTL_MS) {
      await pool.query(
        'UPDATE idempotency_keys SET route = ?, status = NULL, body = NULL, created_at = ? WHERE user_id = ? AND idem_key = ?',
        [route, now(), claims.sub, raw],
      );
      req.idem = { userId: claims.sub, key: raw };
      return;
    }
    if (!prev) return; // vanished between the two queries: just run it
    if (prev.route !== route) return reply.code(422).send({ error: 'idempotency_key_reused' });
    if (prev.status === null)
      return reply.code(409).header('Retry-After', '1').send({ error: 'request_in_progress' });
    reply.code(prev.status).header('Idempotent-Replayed', 'true');
    if (prev.body === null || prev.body === '') return reply.send();
    return reply.type('application/json; charset=utf-8').send(prev.body);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const claim = req.idem;
    if (!claim) return payload;
    req.idem = undefined;
    const status = reply.statusCode;
    const storable =
      (status < 400 || STORED_ERRORS.has(status)) &&
      (payload === null || payload === undefined || typeof payload === 'string');
    try {
      if (storable)
        await pool.query(
          'UPDATE idempotency_keys SET status = ?, body = ? WHERE user_id = ? AND idem_key = ?',
          [status, (payload as string | null | undefined) ?? '', claim.userId, claim.key],
        );
      else
        await pool.query('DELETE FROM idempotency_keys WHERE user_id = ? AND idem_key = ?', [
          claim.userId,
          claim.key,
        ]);
    } catch (err) {
      req.log.warn({ err: { message: (err as Error).message } }, 'idempotency store failed');
    }
    return payload;
  });
}
