import { normalizeIndianPhone } from '../../lib/phone';
import { parseRupeesToPaise } from '../../lib/money';
import type { FeeCycle } from '../../lib/types';

export type ImportErrorKey =
  'name' | 'phone' | 'parentPhone' | 'fee' | 'cycle' | 'dueDay' | 'batchUnknown' | 'duplicate';

export interface ImportRow {
  line: number; // 1-based line in the file (header is line 1)
  name: string;
  phone: string; // E.164 or ''
  parentName: string;
  parentPhone: string; // E.164 or raw when invalid
  className: string;
  monthlyFeePaise: number | null;
  feeCycle: FeeCycle;
  dueDay: number;
  batchIds: string[];
  errors: ImportErrorKey[];
}

export interface ImportContext {
  batches: { id: string; name: string; defaultFee: number }[];
  /** Used when the row names no batch. */
  defaultBatchId?: string;
  existing: { name: string; parentPhone: string }[];
}

const HEADERS: Record<string, string[]> = {
  name: ['name', 'student', 'studentname', 'student name'],
  phone: ['phone', 'mobile', 'studentphone', 'student phone', 'student mobile'],
  parentName: ['parent', 'parentname', 'parent name', 'guardian', 'guardian name'],
  parentPhone: [
    'parentphone',
    'parent phone',
    'parent mobile',
    'parent number',
    'guardian phone',
    'guardian mobile',
  ],
  className: ['class', 'grade', 'standard', 'std'],
  batch: ['batch', 'batchname', 'batch name', 'batches'],
  fee: ['fee', 'fees', 'monthlyfee', 'monthly fee'],
  cycle: ['cycle', 'feecycle', 'fee cycle'],
  dueDay: ['dueday', 'due day', 'due date'],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function mapHeader(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [key, names] of Object.entries(HEADERS)) {
      if (idx[key] === undefined && names.includes(n)) idx[key] = i;
    }
  });
  return idx;
}

const CYCLES: Record<string, FeeCycle> = {
  monthly: 'monthly',
  month: 'monthly',
  quarterly: 'quarterly',
  quarter: 'quarterly',
  'one time': 'one-time',
  onetime: 'one-time',
  'one-time': 'one-time',
};

export const dupKey = (name: string, parentPhone: string) =>
  `${name.trim().toLowerCase()}|${parentPhone}`;

/** Turns CSV rows (first row = header) into validated import rows. Never throws. */
export function mapImportRows(rows: string[][], ctx: ImportContext): ImportRow[] {
  if (rows.length < 2) return [];
  const idx = mapHeader(rows[0]);
  const cell = (r: string[], key: string) =>
    idx[key] === undefined ? '' : (r[idx[key]] ?? '').trim();
  const batchByName = new Map(ctx.batches.map((b) => [norm(b.name), b]));
  const seen = new Set(ctx.existing.map((e) => dupKey(e.name, e.parentPhone)));

  return rows.slice(1).map((r, i) => {
    const errors: ImportErrorKey[] = [];
    const name = cell(r, 'name');
    if (name.length < 2) errors.push('name');

    const rawPhone = cell(r, 'phone');
    const phone = rawPhone ? normalizeIndianPhone(rawPhone) : '';
    if (rawPhone && !phone) errors.push('phone');

    const rawParent = cell(r, 'parentPhone');
    const parentPhone = normalizeIndianPhone(rawParent);
    if (!parentPhone) errors.push('parentPhone');

    const batchIds: string[] = [];
    const batchCell = cell(r, 'batch');
    let defaultFee = 0;
    if (batchCell) {
      for (const part of batchCell
        .split(/[;|/]/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        const b = batchByName.get(norm(part));
        if (b) {
          batchIds.push(b.id);
          defaultFee ||= b.defaultFee;
        } else errors.push('batchUnknown');
      }
    } else if (ctx.defaultBatchId) {
      batchIds.push(ctx.defaultBatchId);
      defaultFee = ctx.batches.find((b) => b.id === ctx.defaultBatchId)?.defaultFee ?? 0;
    }

    const feeCell = cell(r, 'fee');
    const monthlyFeePaise = feeCell ? parseRupeesToPaise(feeCell) : defaultFee;
    if (monthlyFeePaise === null) errors.push('fee');

    const cycleCell = norm(cell(r, 'cycle'));
    const feeCycle = cycleCell ? CYCLES[cycleCell] : 'monthly';
    if (!feeCycle) errors.push('cycle');

    const dueCell = cell(r, 'dueDay');
    const dueDay = dueCell ? Number(dueCell) : 1;
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) errors.push('dueDay');

    if (parentPhone && name.length >= 2) {
      const key = dupKey(name, parentPhone);
      if (seen.has(key)) errors.push('duplicate');
      else seen.add(key);
    }

    return {
      line: i + 2,
      name,
      phone: phone ?? '',
      parentName: cell(r, 'parentName'),
      parentPhone: parentPhone ?? rawParent,
      className: cell(r, 'className'),
      monthlyFeePaise,
      feeCycle: feeCycle ?? 'monthly',
      dueDay: Number.isInteger(dueDay) ? dueDay : 1,
      batchIds,
      errors,
    };
  });
}

export const isImportable = (r: ImportRow) => r.errors.length === 0;
