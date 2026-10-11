import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { MockMailer, SmtpMailer, type Mailer } from './auth/mailer.js';
import {
  AppleNative,
  AppleProvider,
  GoogleProvider,
  pemBody,
  type OAuthProvider,
  type OAuthProviderName,
} from './auth/oauth.js';
import {
  MockBillingProvider,
  PhonePeProvider,
  RazorpayProvider,
  type BillingProvider,
} from './billing/provider.js';
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
  if (config.PHONEPE_CLIENT_ID && config.PHONEPE_CLIENT_SECRET)
    billing = new PhonePeProvider({
      clientId: config.PHONEPE_CLIENT_ID,
      clientSecret: config.PHONEPE_CLIENT_SECRET,
      clientVersion: config.PHONEPE_CLIENT_VERSION,
      env: config.PHONEPE_ENV,
    });
  else if (config.RAZORPAY_KEY_ID && config.RAZORPAY_KEY_SECRET)
    billing = new RazorpayProvider(config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET);
  else if (config.NODE_ENV !== 'production') billing = new MockBillingProvider();
  else
    console.warn(
      'No payment gateway is configured: plan purchases are unavailable until PHONEPE_* (or RAZORPAY_*) settings are set.',
    );
  // Sign-in by email code: SMTP when set up; locally a stand-in that keeps the mail (use OTP_DEV_ECHO to see codes).
  let mailer: Mailer | null = null;
  if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS)
    mailer = new SmtpMailer(
      {
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
      config.MAIL_FROM,
    );
  else if (config.NODE_ENV !== 'production') mailer = new MockMailer();
  // Sign in with Google / Apple, when their keys are set (they also need PUBLIC_BASE_URL for the callback).
  const oauth: Partial<Record<OAuthProviderName, OAuthProvider>> = {};
  if (config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET)
    oauth.google = new GoogleProvider(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  const appleMissing = (
    ['APPLE_SERVICES_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] as const
  ).filter((k) => !config[k]);
  if (appleMissing.length === 0) {
    const apple = new AppleProvider({
      servicesId: config.APPLE_SERVICES_ID!,
      teamId: config.APPLE_TEAM_ID!,
      keyId: config.APPLE_KEY_ID!,
      privateKey: config.APPLE_PRIVATE_KEY!,
    });
    // A key that does not parse would only fail at someone's sign-in; say so at startup instead.
    if (await apple.keyWorks()) oauth.apple = apple;
    else
      console.warn(
        `Sign in with Apple is off: APPLE_PRIVATE_KEY is not a valid .p8 key (${pemBody(config.APPLE_PRIVATE_KEY!).length} key characters; a Sign in with Apple .p8 has 200).`,
      );
  } else if (appleMissing.length < 4)
    console.warn(`Sign in with Apple is off: missing ${appleMissing.join(', ')}.`);
  // the iPhone app's own Apple sheet: only needs our bundle id and Apple's public keys
  const appleNative = new AppleNative(config.APPLE_BUNDLE_ID);
  const app = await buildApp({ config, pool, provider, billing, mailer, oauth, appleNative });

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
