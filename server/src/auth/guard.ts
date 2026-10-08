import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import type { Pool } from '../db.js';
import { verifyToken } from '../lib/jwt.js';

/** Who is calling, read from the database on every request (never trusted from the token alone). */
export interface AuthContext {
  userId: string;
  phone: string;
  name: string;
  language: 'en' | 'hi';
  /** Null until the user creates or joins an institute. Every data query must be scoped by this. */
  instituteId: string | null;
  role: 'owner' | 'staff' | null;
  onboardingDone: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

type Row = {
  id: string;
  phone: string;
  name: string;
  language: 'en' | 'hi';
  institute_id: string | null;
  role: 'owner' | 'staff' | null;
  onboarding_done: number | null;
};

/** preHandler factory: signed-in users only. */
export function authenticate(deps: {
  pool: Pool;
  config: Pick<Config, 'JWT_SECRET'>;
  clock?: () => Date;
}) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    const token =
      typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : null;
    const claims = verifyToken(
      token,
      deps.config.JWT_SECRET,
      (deps.clock ?? (() => new Date()))().getTime(),
    );
    if (!claims) return reply.code(401).send({ error: 'unauthorized' });
    const [rows] = (await deps.pool.query(
      'SELECT u.id, u.phone, u.name, u.language, m.institute_id, m.role, m.onboarding_done FROM users u LEFT JOIN memberships m ON m.user_id = u.id WHERE u.id = ?',
      [claims.sub],
    )) as unknown as [Row[]];
    const r = rows[0];
    if (!r) return reply.code(401).send({ error: 'unauthorized' });
    req.auth = {
      userId: r.id,
      phone: r.phone,
      name: r.name,
      language: r.language,
      instituteId: r.institute_id,
      role: r.role,
      onboardingDone: !!r.onboarding_done,
    };
  };
}

/** After `authenticate`: the caller must belong to an institute. */
export const requireInstitute = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.auth?.instituteId) return reply.code(403).send({ error: 'no_institute' });
};

/** After `authenticate`: the caller must be the institute's owner. */
export const requireOwner = async (req: FastifyRequest, reply: FastifyReply) => {
  if (req.auth?.role !== 'owner' || !req.auth.instituteId)
    return reply.code(403).send({ error: 'forbidden' });
};
