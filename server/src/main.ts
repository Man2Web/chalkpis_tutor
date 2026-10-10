import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { MockBillingProvider, RazorpayProvider, type BillingProvider } from './billing/provider.js';
import {
  MetaCloudProvider,
  MockProvider,
  WhatsAppProvider,
  type MessageProvider,
} from './messaging/provider.js';
import { startScheduler } from './jobs/runner.js';
import { parseTemplates } from './messaging/templates.js';
import { startWorker } from './messaging/worker.js';
import { runMigrations } from './migrate.js';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  if (config.AUTO_MIGRATE) {
    const r = await runMigrations(pool, MIGRATIONS);
    if (r.applied.length) console.log(`migrations applied: ${r.applied.join(', ')}`);
  }
  let provider: MessageProvider | null = null;
  if (config.WA_CLOUD_PHONE_NUMBER_ID && config.WA_CLOUD_TOKEN && config.WA_TEMPLATE_OTP) {
    provider = new MetaCloudProvider({
      phoneNumberId: config.WA_CLOUD_PHONE_NUMBER_ID,
      token: config.WA_CLOUD_TOKEN,
      version: config.WA_CLOUD_API_VERSION,
    });
  } else if (
    config.WA_API_URL &&
    config.WA_FROM &&
    config.WA_CLIENT_ID &&
    config.WA_CLIENT_PASSWORD &&
    config.WA_TEMPLATE_OTP
  ) {
    provider = new WhatsAppProvider({
      baseUrl: config.WA_API_URL,
      clientId: config.WA_CLIENT_ID,
      clientPassword: config.WA_CLIENT_PASSWORD,
      from: config.WA_FROM,
      method: config.WA_API_METHOD,
    });
  } else if (config.NODE_ENV !== 'production') {
    provider = new MockProvider(); // local work: codes are not sent anywhere (use OTP_DEV_ECHO to see them)
  } else {
    console.warn(
      'WhatsApp is not configured: login codes cannot be sent until WA_* settings are set.',
    );
  }
  let billing: BillingProvider | null = null;
  if (config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET)
    billing = new RazorpayProvider(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET);
  else if (config.NODE_ENV !== 'production') billing = new MockBillingProvider();
  else
    console.warn(
      'Razorpay is not configured: plan purchases are unavailable until RAZORPAY_* settings are set.',
    );
  const app = await buildApp({ config, pool, provider, billing });

  const stopWorker = startWorker(
    { pool, provider, templates: parseTemplates(config.WA_TEMPLATES) },
    (e) =>
      app.log.error(
        { err: { name: (e as Error).name, code: (e as { code?: string }).code } },
        'message worker failed',
      ),
  );

  const stopScheduler = startScheduler(pool, app.log);

  const stop = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    stopWorker();
    stopScheduler();
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((e) => {
  // Config and migration errors are safe to print: they never contain passwords.
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
