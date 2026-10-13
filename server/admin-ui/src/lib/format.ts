const TZ = { timeZone: 'Asia/Kolkata' } as const;
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Paise to "₹1,500". */
export const money = (paise?: number | null) => `₹${inr.format(Math.round((paise ?? 0) / 100))}`;
export const num = (v?: number | null) => inr.format(v ?? 0);
/** 1.2k, 3.4L, 1.1Cr */
export function compact(v: number) {
  const a = Math.abs(v);
  return a >= 1e7
    ? `${(a / 1e7).toFixed(1)}Cr`
    : a >= 1e5
      ? `${(a / 1e5).toFixed(1)}L`
      : a >= 1e3
        ? `${(a / 1e3).toFixed(1)}k`
        : String(Math.round(a));
}
export const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
        ...TZ,
      })
    : '—';
export const dshort = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...TZ }) : '—';
export const dlong = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...TZ,
  });
export const dateOnly = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...TZ,
      })
    : '—';
export function ago(iso?: string | null) {
  if (!iso) return 'never';
  const t = (Date.now() - new Date(iso).getTime()) / 1000;
  if (t < 45) return 'just now';
  if (t < 3600) return `${Math.round(t / 60)}m ago`;
  if (t < 86400) return `${Math.round(t / 3600)}h ago`;
  if (t < 86400 * 30) return `${Math.round(t / 86400)}d ago`;
  return dshort(iso);
}
/** "1 student", "2 students" */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
export function initials(name?: string | null) {
  const p = String(name || '?')
    .replace(/^\+\d{2}/, '')
    .trim()
    .split(/\s+/);
  return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#6366f1', '#14b8a6', '#737373'];
export function hue(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
/** % change vs the previous period: null when there is nothing to compare. */
export function pctChange(now: number, before: number): number | 'new' | null {
  if (!now && !before) return null;
  if (!before) return 'new';
  return Math.round(((now - before) / before) * 100);
}
/** A day as YYYY-MM-DD in India. */
export const ymdIst = (iso: string) =>
  new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10);
