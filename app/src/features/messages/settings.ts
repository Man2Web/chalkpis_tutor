/** Mirrors functions/src/lib/notify.ts (the server enforces these ranges too). */
export interface NotifySettings {
  enabled: boolean;
  absent: boolean;
  late: boolean;
  feeDue: boolean;
  feeDueDaysBefore: number;
  feeOverdue: boolean;
  overdueEveryDays: number;
  paymentReceived: boolean;
  language: 'en' | 'hi';
}

export const DEFAULT_SETTINGS: NotifySettings = {
  enabled: false,
  absent: true,
  late: true,
  feeDue: true,
  feeDueDaysBefore: 2,
  feeOverdue: true,
  overdueEveryDays: 7,
  paymentReceived: true,
  language: 'en',
};

export const RANGES = { feeDueDaysBefore: [0, 15], overdueEveryDays: [1, 30] } as const;

export const clampDays = (key: keyof typeof RANGES, n: number) =>
  Math.min(RANGES[key][1], Math.max(RANGES[key][0], Math.round(n)));

/** Saved choices with anything missing or out of range replaced by the safe default (messages stay off by default). */
export function normalizeSettings(raw: Record<string, unknown> | undefined): NotifySettings {
  const d = DEFAULT_SETTINGS;
  const flag = (v: unknown, f: boolean) => (typeof v === 'boolean' ? v : f);
  const num = (v: unknown, key: keyof typeof RANGES, f: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clampDays(key, v) : f;
  return {
    enabled: flag(raw?.enabled, d.enabled),
    absent: flag(raw?.absent, d.absent),
    late: flag(raw?.late, d.late),
    feeDue: flag(raw?.feeDue, d.feeDue),
    feeDueDaysBefore: num(raw?.feeDueDaysBefore, 'feeDueDaysBefore', d.feeDueDaysBefore),
    feeOverdue: flag(raw?.feeOverdue, d.feeOverdue),
    overdueEveryDays: num(raw?.overdueEveryDays, 'overdueEveryDays', d.overdueEveryDays),
    paymentReceived: flag(raw?.paymentReceived, d.paymentReceived),
    language: raw?.language === 'hi' ? 'hi' : 'en',
  };
}

export type MessageStatus = 'queued' | 'sent' | 'failed' | 'skipped';

/** Translation key for why a message was skipped or failed; unknown provider codes are shown as they are. */
export function reasonKey(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return ['not-configured', 'no-template', 'bad-phone'].includes(reason)
    ? `messages.reason.${reason}`
    : null;
}
