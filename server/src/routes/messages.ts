import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import { authenticate, requireInstitute, requireOwner } from '../auth/guard.js';
import { badRequest } from '../errors.js';
import { enqueueFeeReminders, getSettings, saveSettings } from '../messaging/notify.js';
import { idParam, parse } from '../lib/params.js';
import { payQrPng, readPayQr } from '../messaging/payQr.js';
import { sendFeeReminderNow, sendReceiptNow } from '../messaging/sendNow.js';

type Deps = Pick<AppDeps, 'config' | 'pool'> & { clock?: () => Date };

const settingsBody = z.object({
  enabled: z.boolean(),
  absent: z.boolean(),
  late: z.boolean(),
  feeDue: z.boolean(),
  feeDueDaysBefore: z.number().int().min(0).max(15),
  feeOverdue: z.boolean(),
  overdueEveryDays: z.number().int().min(1).max(30),
  paymentReceived: z.boolean(),
  // English only now; an old app may still send 'hi', which is stored as English.
  language: z.enum(['en', 'hi']).transform(() => 'en' as const),
});

const logQuery = z.object({
  status: z.enum(['queued', 'sending', 'sent', 'failed', 'skipped']).optional(),
  studentId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

export function messageRoutes(app: FastifyInstance, deps: Deps) {
  const read = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const write = { preHandler: [authenticate(deps), requireInstitute, requireOwner] };
  const now = () => (deps.clock ?? (() => new Date()))();
  const inst = (req: { auth: { instituteId: string | null } | null }) => req.auth!.instituteId!;

  app.get('/settings/notifications', read, async (req) => getSettings(deps.pool, inst(req)));
  app.put('/settings/notifications', write, async (req) => {
    await saveSettings(deps.pool, inst(req), parse(settingsBody, req.body), now());
    return { ok: true };
  });

  app.get('/messages', read, async (req) => {
    const q = parse(logQuery, req.query);
    const where = ['m.institute_id = ?'];
    const args: unknown[] = [inst(req)];
    if (q.status) {
      where.push('m.status = ?');
      args.push(q.status);
    }
    if (q.studentId) {
      where.push('m.student_id = ?');
      args.push(q.studentId);
    }
    const [rows] = (await deps.pool.query(
      `SELECT m.id, m.student_id, s.name AS student_name, m.type, m.status, m.reason, m.channel, m.to_last4, m.lang, m.attempts, m.error, m.created_at, m.sent_at
         FROM messages m JOIN students s ON s.institute_id = m.institute_id AND s.id = m.student_id
        WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC, m.id LIMIT ? OFFSET ?`,
      [...args, q.limit, q.offset],
    )) as unknown as [
      {
        id: string;
        student_id: string;
        student_name: string;
        type: string;
        status: string;
        reason: string | null;
        channel: string | null;
        to_last4: string;
        lang: string;
        attempts: number;
        error: string | null;
        created_at: Date;
        sent_at: Date | null;
      }[],
    ];
    return {
      messages: rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        studentName: r.student_name,
        type: r.type,
        status: r.status,
        reason: r.reason,
        channel: r.channel,
        toLast4: r.to_last4,
        lang: r.lang,
        attempts: r.attempts,
        error: r.error,
        createdAt: r.created_at.toISOString(),
        sentAt: r.sent_at ? r.sent_at.toISOString() : null,
      })),
    };
  });

  // "Send today's reminders now" for this institute (the daily job does the same for everyone).
  app.post('/messages/reminders/run', write, async (req) => {
    const s = await getSettings(deps.pool, inst(req));
    if (!s.enabled) throw badRequest('messages_off');
    return { queued: await enqueueFeeReminders(deps.pool, inst(req), now()) };
  });

  // ---- sent now by the tutor, through the WhatsApp API ----
  const sendCfg = () => ({
    publicBaseUrl: deps.config.PUBLIC_BASE_URL,
    secret: deps.config.JWT_SECRET,
  });
  const id = (req: { params: unknown }) => idParam((req.params as { id: string }).id);
  app.post('/students/:id/remind', write, async (req, reply) =>
    reply.code(202).send(await sendFeeReminderNow(deps.pool, sendCfg(), inst(req), id(req), now())),
  );
  app.post('/fees/payments/:id/send-receipt', write, async (req, reply) => {
    await sendReceiptNow(deps.pool, inst(req), id(req), now());
    return reply.code(202).send({ queued: true });
  });

  // ---- the UPI QR picture WhatsApp downloads for a fee reminder (public, but only links this server signed) ----
  app.get(
    '/pay-qr.png',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const q = req.query as { d?: unknown; s?: unknown };
      const p = readPayQr(deps.config.JWT_SECRET, q.d, q.s);
      if (!p) return reply.code(404).send({ error: 'not_found' });
      return reply
        .type('image/png')
        .header('Cache-Control', 'public, max-age=86400')
        .send(await payQrPng(p));
    },
  );
}
