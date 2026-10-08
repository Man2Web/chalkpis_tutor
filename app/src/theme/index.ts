import { PixelRatio } from 'react-native';

export const colors = {
  primary: '#2F5BEA',
  primaryDark: '#2447BE',
  primarySoft: '#EAF0FF',
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  text: '#111114',
  textMuted: '#6B6B76',
  border: '#E5E5EA',
  success: '#1C7C3C',
  successSoft: '#E7F6EC',
  warning: '#8A5200',
  warningSoft: '#FFF3DC',
  danger: '#B42318',
  dangerSoft: '#FDECEC',
  onPrimary: '#FFFFFF',
  overlay: 'rgba(17,17,20,0.4)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 } as const;

/** Soft two-layer depth, as on iOS cards. */
export const shadow = {
  card: { boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 6px 18px rgba(16,24,40,0.05)' },
  raised: { boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 10px 30px rgba(16,24,40,0.08)' },
} as const;

/** Minimum touch target in dp (accessibility requirement). */
export const TAP = 48;

/** Scales a font size with the system font setting, capped so layouts don't break. */
export const fs = (size: number) => size * Math.min(PixelRatio.getFontScale(), 1.4);

export const type = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700' as const,
    letterSpacing: -0.6,
    color: colors.text,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
    color: colors.text,
  },
  heading: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
};

/** Soft background + dark ink pairs for avatars; every pair keeps text above 4.5:1. */
export const tints = [
  { bg: '#E5ECFF', ink: '#2F4FC7' },
  { bg: '#E3F5EA', ink: '#1C7C3C' },
  { bg: '#EEE9FF', ink: '#5B3FC4' },
  { bg: '#FFEFD9', ink: '#8A5200' },
  { bg: '#DDF3F3', ink: '#0B6B6D' },
  { bg: '#FDE8EF', ink: '#B3205C' },
] as const;

/** Same name, same colour, every time. */
export function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tints[h % tints.length];
}
