import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main() {
  const config = loadConfig();
  const pool = createPool(config);
  if (config.AUTO_MIGRATE) {
    const r = await runMigrations(pool, MIGRATIONS);
    if (r.applied.length) console.log(`migrations applied: ${r.applied.join(', ')}`);
  }
  const app = await buildApp({ config, pool });

  const stop = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
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
