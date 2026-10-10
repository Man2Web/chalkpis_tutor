import { PixelRatio } from 'react-native';

/**
 * Apple's system palette (iOS Human Interface Guidelines), tuned so text colours keep at least 4.5:1 on white.
 * Fills use the bright system colours; text uses the "accessible" (darker) variants.
 */
export const colors = {
  primary: '#007AFF', // systemBlue: buttons, tint, selected states
  primaryDark: '#0062CC', // blue text and links on white
  primarySoft: 'rgba(0,122,255,0.12)', // tinted button / chip background
  bg: '#F2F2F7', // systemGroupedBackground
  surface: '#FFFFFF', // secondarySystemGroupedBackground
  fill: 'rgba(118,118,128,0.12)', // tertiarySystemFill: search fields, segmented control track
  text: '#000000', // label
  textMuted: 'rgba(60,60,67,0.6)', // secondaryLabel
  textFaint: 'rgba(60,60,67,0.3)', // tertiaryLabel: placeholders, chevrons
  border: 'rgba(60,60,67,0.18)', // separator
  success: '#248A3D', // accessible systemGreen (text)
  successFill: '#34C759',
  successSoft: 'rgba(52,199,89,0.14)',
  warning: '#C93400', // accessible systemOrange (text)
  warningFill: '#FF9500',
  warningSoft: 'rgba(255,149,0,0.14)',
  danger: '#D70015', // accessible systemRed (text)
  dangerFill: '#FF3B30',
  dangerSoft: 'rgba(255,59,48,0.12)',
  indigo: '#5856D6',
  teal: '#30B0C7',
  purple: '#AF52DE',
  pink: '#FF2D55',
  gray: '#8E8E93',
  onPrimary: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** iOS keeps depth subtle: a hairline-soft shadow on cards, a little more on raised surfaces. */
export const shadow = {
  card: { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  raised: { boxShadow: '0 4px 14px rgba(0,0,0,0.10)' },
} as const;

/** Minimum touch target in dp (44 pt on iOS, 48 dp on Android: we use the larger). */
export const TAP = 48;

/** Scales a font size with the system font setting, capped so layouts don't break. */
export const fs = (size: number) => size * Math.min(PixelRatio.getFontScale(), 1.4);

/** The iOS type scale (sizes in pt), with the older names kept so every screen moves to it at once. */
export const type = {
  largeTitle: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700' as const,
    letterSpacing: 0.37,
    color: colors.text,
  },
  title1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: 0.36,
    color: colors.text,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700' as const,
    letterSpacing: 0.36,
    color: colors.text,
  },
  title2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700' as const,
    letterSpacing: 0.35,
    color: colors.text,
  },
  title3: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600' as const,
    letterSpacing: 0.38,
    color: colors.text,
  },
  heading: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600' as const,
    letterSpacing: -0.41,
    color: colors.text,
  },
  body: { fontSize: 17, lineHeight: 22, letterSpacing: -0.41, color: colors.text },
  callout: { fontSize: 16, lineHeight: 21, letterSpacing: -0.32, color: colors.text },
  subhead: { fontSize: 15, lineHeight: 20, letterSpacing: -0.24, color: colors.text },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600' as const,
    letterSpacing: -0.24,
    color: colors.text,
  },
  footnote: { fontSize: 13, lineHeight: 18, letterSpacing: -0.08, color: colors.textMuted },
  caption: { fontSize: 13, lineHeight: 18, letterSpacing: -0.08, color: colors.textMuted },
  caption2: { fontSize: 12, lineHeight: 16, color: colors.textMuted },
  /** The small grey label above a field or a group of choices (same as Input's label). */
  fieldLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
    color: colors.textMuted,
    marginLeft: 4,
  },
  sectionHeader: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.08,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
  },
};

/** Soft background + dark ink pairs for avatars; every pair keeps text above 4.5:1. */
export const tints = [
  { bg: '#E3EEFF', ink: '#0050B3' },
  { bg: '#E2F6E7', ink: '#1E7A34' },
  { bg: '#ECEBFB', ink: '#4240B0' },
  { bg: '#FFF0DE', ink: '#A33A00' },
  { bg: '#DDF3F7', ink: '#0B6577' },
  { bg: '#FDE6EC', ink: '#B0123C' },
] as const;

/** Same name, same colour, every time. */
export function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tints[h % tints.length];
}
export { column, MAX_CONTENT, useLayout } from './layout';
