import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

const config = loadConfig();
const pool = createPool(config);
runMigrations(pool, path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations'))
  .then((r) =>
    console.log(`applied: ${r.applied.join(', ') || 'none'}; already done: ${r.skipped.length}`),
  )
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
