import { PixelRatio } from 'react-native';

export const colors = {
  primary: '#2F5BEA',
  primaryDark: '#2447BE',
  primarySoft: '#E8EEFD',
  bg: '#F6F7FB',
  surface: '#FFFFFF',
  text: '#14171F',
  textMuted: '#5B6275',
  border: '#E1E4ED',
  success: '#1B8A4B',
  successSoft: '#E3F5EA',
  warning: '#A66200',
  warningSoft: '#FFF1D6',
  danger: '#C62828',
  dangerSoft: '#FDE8E8',
  onPrimary: '#FFFFFF',
  overlay: 'rgba(20,23,31,0.45)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Minimum touch target in dp (accessibility requirement). */
export const TAP = 48;

/** Scales a font size with the system font setting, capped so layouts don't break. */
export const fs = (size: number) => size * Math.min(PixelRatio.getFontScale(), 1.4);

export const type = {
  title: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 18, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
};
