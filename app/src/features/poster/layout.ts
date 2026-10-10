export type PosterKind = 'toppers' | 'admission' | 'festival';
export type PosterSize = 'square' | 'status';

export const SIZES: Record<PosterSize, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  status: { w: 1080, h: 1920 },
};

export const THEMES: Record<PosterKind, { from: string; to: string; accent: string; ink: string }> =
  {
    toppers: { from: '#1E3A8A', to: '#312E81', accent: '#FBBF24', ink: '#FFFFFF' },
    admission: { from: '#065F46', to: '#0F766E', accent: '#FDE68A', ink: '#FFFFFF' },
    festival: { from: '#C2410C', to: '#9D174D', accent: '#FEF3C7', ink: '#FFFFFF' },
  };

/**
 * Breaks text into lines of at most `max` characters at spaces (a single long word gets its own line, cut if it
 * must be), and keeps at most `lines` lines, ending the last with "…" when text was dropped.
 */
export function wrapText(text: string, max: number, lines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const word = w.length > max ? `${w.slice(0, max - 1)}…` : w;
    if (!cur) cur = word;
    else if (cur.length + 1 + word.length <= max) cur += ` ${word}`;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out;
  const kept = out.slice(0, lines);
  const last = kept[lines - 1]!;
  kept[lines - 1] = last.length >= max ? `${last.slice(0, max - 1)}…` : `${last}…`;
  return kept;
}

/** Up to 6 topper cards: 1-3 in one row, 4 in two rows of 2, 5-6 in two rows of 3. */
export function gridFor(count: number): { cols: number; rows: number } {
  const n = Math.min(Math.max(count, 0), 6);
  if (n === 0) return { cols: 0, rows: 0 };
  if (n <= 3) return { cols: n, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
