import { createHash } from 'node:crypto';
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
 *
 * Hardening (9 Nov 2026): a key is bound to the exact address (method, URL with its record ids and query), so the same
 * key for another student is refused (422) instead of replaying the first student's answer; it is
 * honoured only for a person who still exists and is not blocked; and a route can name response fields that must
 * never be kept (`config: { idempotencyRedact: ['token', 'url'] }`), which a replay then leaves out.
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

declare module 'fastify' {
  interface FastifyContextConfig {
    /** response fields an idempotent replay must not keep (secrets such as a parent link's token) */
    idempotencyRedact?: string[];
  }
}

const routeOf = (req: FastifyRequest) => `${req.method} ${req.routeOptions.url ?? req.url}`;

/**
 * One fingerprint for the exact request address: method plus the full URL with its record ids and query. The body is
 * deliberately left out: the app keeps a key across a retry after a lost answer, and a person may fix the form before
 * tapping again; replaying the first (already done) result then is what prevents a second payment or student.
 */
const requestHash = (req: FastifyRequest) =>
  createHash('sha256').update(`${req.method} ${req.url}`).digest('hex');

/** The stored copy of a response, with the route's secret fields taken out. */
function redacted(payload: string, fields: string[] | undefined): string {
  if (!fields?.length || !payload) return payload;
  try {
    const o = JSON.parse(payload) as Record<string, unknown>;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return payload;
    for (const f of fields) delete o[f];
    return JSON.stringify(o);
  } catch {
    return '';
  }
}

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
    // a person who was deleted or blocked gets no stored answers; the route's own sign-in check refuses them
    const [who] = (await pool.query('SELECT blocked_at FROM users WHERE id = ?', [
      claims.sub,
    ])) as unknown as [{ blocked_at: Date | null }[]];
    if (!who[0] || who[0].blocked_at) return;
    const route = routeOf(req);
    const hash = requestHash(req);
    const [ins] = (await pool.query(
      'INSERT IGNORE INTO idempotency_keys (user_id, idem_key, route, req_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      [claims.sub, raw, route, hash, now()],
    )) as unknown as [{ affectedRows: number }];
    if (ins.affectedRows === 1) {
      req.idem = { userId: claims.sub, key: raw };
      return;
    }
    const [rows] = (await pool.query(
      'SELECT route, req_hash, status, body, created_at FROM idempotency_keys WHERE user_id = ? AND idem_key = ?',
      [claims.sub, raw],
    )) as unknown as [
      {
        route: string;
        req_hash: string | null;
        status: number | null;
        body: string | null;
        created_at: Date;
      }[],
    ];
    const prev = rows[0];
    // an old key from yesterday: forget it and run this request as new
    if (prev && now().getTime() - prev.created_at.getTime() > IDEMPOTENCY_TTL_MS) {
      await pool.query(
        'UPDATE idempotency_keys SET route = ?, req_hash = ?, status = NULL, body = NULL, created_at = ? WHERE user_id = ? AND idem_key = ?',
        [route, hash, now(), claims.sub, raw],
      );
      req.idem = { userId: claims.sub, key: raw };
      return;
    }
    if (!prev) return; // vanished between the two queries: just run it
    // the same key for a different request (another route, another record or other values)
    if (prev.route !== route || (prev.req_hash !== null && prev.req_hash !== hash))
      return reply.code(422).send({ error: 'idempotency_key_reused' });
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
          [
            status,
            redacted(
              (payload as string | null | undefined) ?? '',
              req.routeOptions.config?.idempotencyRedact,
            ),
            claim.userId,
            claim.key,
          ],
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
