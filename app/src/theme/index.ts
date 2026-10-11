import { PixelRatio, Platform, type TextStyle } from 'react-native';

/**
 * PanelUI "Panel" theme (panelui.dev), light: neutral greys, a near-black primary, hairline borders instead of
 * shadows, and soft tinted status colours. Text colours keep at least 4.5:1 on white.
 */
export const colors = {
  primary: '#262626', // buttons, selected states, tint
  primaryDark: '#262626', // links and tinted text
  primarySoft: 'rgba(0,0,0,0.06)', // secondary button / chip background
  bg: '#FFFFFF', // screen background
  surface: '#FFFFFF', // cards and inner panels
  shell: '#F7F7F7', // the grey panel around a card's header and body
  shellRaised: '#F1F1F1',
  fill: 'rgba(0,0,0,0.06)', // search fields, segmented track, skeletons
  text: '#262626',
  textMuted: '#686868',
  textFaint: '#A3A3A3',
  border: 'rgba(0,0,0,0.08)',
  input: 'rgba(0,0,0,0.10)',
  ring: '#A3A3A3',
  success: '#047857',
  successFill: '#10B981',
  successSoft: 'rgba(16,185,129,0.10)',
  warning: '#B45309',
  warningFill: '#F59E0B',
  warningSoft: 'rgba(245,158,11,0.10)',
  danger: '#B91C1C',
  dangerFill: '#EF4444',
  dangerSoft: 'rgba(239,68,68,0.10)',
  info: '#1D4ED8',
  infoFill: '#3B82F6',
  infoSoft: 'rgba(59,130,246,0.10)',
  indigo: '#6366F1',
  teal: '#14B8A6',
  purple: '#8B5CF6',
  pink: '#F43F5E',
  gray: '#A3A3A3',
  onPrimary: '#FAFAFA',
  overlay: 'rgba(0,0,0,0.4)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
/** Panel radii: 10 for controls, 18 for an inner panel, 22 for the shell around it. */
export const radius = { sm: 6, md: 10, lg: 18, xl: 22, pill: 999 } as const;

/** Panel keeps depth flat: hairlines do the work, with a faint lift only on raised controls and overlays. */
export const shadow = {
  card: {},
  control: { boxShadow: '0 1px 3px rgba(0,0,0,0.10), 0 1px 2px -1px rgba(0,0,0,0.10)' },
  raised: { boxShadow: '0 10px 30px -10px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.06)' },
} as const;

/** Inter faces, loaded in App.tsx. */
export const fonts = {
  '400': 'Inter_400Regular',
  '500': 'Inter_500Medium',
  '600': 'Inter_600SemiBold',
  '700': 'Inter_700Bold',
  '800': 'Inter_800ExtraBold',
} as const;

/**
 * Inter at a weight. Each weight is its own font file, so Android gets only the family (adding fontWeight there
 * fakes a second bold); iOS and web get both.
 */
export function font(weight: TextStyle['fontWeight'] = '400'): TextStyle {
  const w = weight === 'bold' ? '700' : weight === 'normal' ? '400' : String(weight);
  const fontFamily = fonts[w as keyof typeof fonts] ?? (Number(w) > 700 ? fonts['800'] : fonts['400']);
  return Platform.OS === 'android' ? { fontFamily } : { fontFamily, fontWeight: weight };
}

/** Minimum touch target in dp (44 pt on iOS, 48 dp on Android: we use the larger). */
export const TAP = 48;

/** Scales a font size with the system font setting, capped so layouts don't break. */
export const fs = (size: number) => size * Math.min(PixelRatio.getFontScale(), 1.4);

/** The type scale, set in Inter with Panel's slightly tight tracking. Older names kept so every screen moves at once. */
export const type = {
  largeTitle: { fontSize: 30, lineHeight: 36, ...font('700'), letterSpacing: -0.6, color: colors.text },
  title1: { fontSize: 26, lineHeight: 32, ...font('700'), letterSpacing: -0.5, color: colors.text },
  title: { fontSize: 26, lineHeight: 32, ...font('700'), letterSpacing: -0.5, color: colors.text },
  title2: { fontSize: 22, lineHeight: 28, ...font('700'), letterSpacing: -0.4, color: colors.text },
  title3: { fontSize: 19, lineHeight: 24, ...font('600'), letterSpacing: -0.3, color: colors.text },
  heading: { fontSize: 16, lineHeight: 22, ...font('600'), letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 16, lineHeight: 22, ...font('400'), letterSpacing: -0.15, color: colors.text },
  callout: { fontSize: 15, lineHeight: 21, ...font('400'), letterSpacing: -0.1, color: colors.text },
  subhead: { fontSize: 14, lineHeight: 20, ...font('400'), letterSpacing: -0.05, color: colors.text },
  label: { fontSize: 14, lineHeight: 20, ...font('600'), letterSpacing: -0.1, color: colors.text },
  footnote: { fontSize: 13, lineHeight: 18, ...font('400'), color: colors.textMuted },
  caption: { fontSize: 13, lineHeight: 18, ...font('400'), color: colors.textMuted },
  caption2: { fontSize: 12, lineHeight: 16, ...font('400'), color: colors.textMuted },
  /** The small grey label above a field or a group of choices (same as Input's label). */
  fieldLabel: { fontSize: 13, lineHeight: 18, ...font('500'), color: colors.textMuted, marginLeft: 2 },
  sectionHeader: {
    fontSize: 11,
    lineHeight: 16,
    ...font('600'),
    letterSpacing: 0.6,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
  },
};

/** Soft background + dark ink pairs for avatars; every pair keeps text above 4.5:1. */
export const tints = [
  { bg: '#EFF6FF', ink: '#1D4ED8' },
  { bg: '#ECFDF5', ink: '#047857' },
  { bg: '#F5F3FF', ink: '#6D28D9' },
  { bg: '#FFFBEB', ink: '#B45309' },
  { bg: '#F0FDFA', ink: '#0F766E' },
  { bg: '#FFF1F2', ink: '#BE123C' },
] as const;

/** Same name, same colour, every time. */
export function tintFor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tints[h % tints.length];
}
export { column, MAX_CONTENT, useLayout } from './layout';
