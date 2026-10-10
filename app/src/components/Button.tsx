import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { haptic } from '../lib/haptics';
import { colors, radius, spacing } from '../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

type Props = {
  title: string;
  onPress: () => void;
  /** primary = filled, secondary = tinted, danger = destructive, ghost = plain text button (iOS styles). */
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  size?: 'large' | 'small';
  style?: ViewStyle;
};

const ink: Record<Variant, string> = {
  primary: colors.onPrimary,
  secondary: colors.primaryDark,
  danger: colors.danger,
  ghost: colors.primaryDark,
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  size = 'large',
  style,
}: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      android_ripple={
        variant === 'ghost' ? undefined : { color: 'rgba(255,255,255,0.25)', foreground: true }
      }
      style={({ pressed }) => [
        styles.base,
        size === 'small' && styles.small,
        styles[variant],
        pressed && Platform.OS !== 'android' && { opacity: 0.7 },
        off && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={ink[variant]} />
      ) : (
        <Text style={[styles.text, size === 'small' && styles.smallText, { color: ink[variant] }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  small: { minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.dangerSoft },
  ghost: { backgroundColor: 'transparent', minHeight: 44 },
  text: { fontSize: 17, fontWeight: '600', letterSpacing: -0.41 },
  smallText: { fontSize: 15, letterSpacing: -0.24 },
});
