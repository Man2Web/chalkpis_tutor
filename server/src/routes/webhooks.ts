import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../config.js';
import { dlrToken, maskDigits } from '../messaging/provider.js';

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Delivery reports from the WhatsApp gateway: whether WhatsApp delivered a message or why it refused it. The address
 * carries a secret only the gateway is told, and each report is written to the server log with phone numbers masked
 * (Coolify > the service > Runtime Logs, search "wa-dlr").
 */
export function webhookRoutes(app: FastifyInstance, deps: { config: Config }) {
  const token = dlrToken(deps.config.JWT_SECRET);
  void app.register(async (scope) => {
    // The gateway may post JSON, a form or plain text: keep whatever arrives as text.
    scope.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => done(null, body));
    scope.route({
      method: ['GET', 'POST'],
      url: '/webhooks/wa-dlr/:token',
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
      handler: async (req, reply) => {
        const t = (req.params as { token?: string }).token ?? '';
        if (!same(t, token)) return reply.code(404).send({ error: 'not_found' });
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
        const query = new URLSearchParams(req.query as Record<string, string>).toString();
        req.log.info(
          { waDlr: maskDigits(raw).slice(0, 2000), query: maskDigits(query).slice(0, 500) },
          'wa-dlr',
        );
        return reply.send('OK');
      },
    });
  });
}
