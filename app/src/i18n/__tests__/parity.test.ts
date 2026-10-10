import fs from 'node:fs';
import path from 'node:path';
import en from '../en.json';

const SRC = path.join(__dirname, '..', '..');

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : files(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

const has = (key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], en) !==
    undefined ||
  // plural keys live as key_one / key_other
  ['_one', '_other'].some((s) => {
    const parts = key.split('.');
    const last = parts.pop()!;
    const parent = parts.reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      en,
    );
    return (parent as Record<string, unknown> | undefined)?.[last + s] !== undefined;
  });

describe('translations (English only)', () => {
  it('every fixed text key used in the code exists in en.json', () => {
    const missing: string[] = [];
    for (const f of files(SRC)) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g))
        if (!has(m[1]!)) missing.push(`${path.relative(SRC, f)}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});

describe('legal texts', () => {
  it('the app and the website show the same Privacy Policy and Terms', () => {
    const app = fs.readFileSync(path.join(SRC, 'features', 'legal', 'legal.json'), 'utf8');
    const web = fs.readFileSync(
      path.join(SRC, '..', '..', 'server', 'public', 'legal.json'),
      'utf8',
    );
    expect(web).toBe(app);
  });
});
