import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The stylesheet of the pay, billing and checkout pages. Its address carries a hash of its content, so a browser that
 * cached an older copy (for an hour) picks up a new one as soon as it changes.
 */
export const PAY_CSS = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'pay.css'),
  'utf8',
);
export const PAY_CSS_HREF = `/pay.css?v=${createHash('sha256').update(PAY_CSS).digest('hex').slice(0, 10)}`;
