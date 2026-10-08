import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing, TAP } from '../theme';

type Props = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && { opacity: 0.85 },
        off && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.primary}
        />
      ) : (
        <Text style={[styles.text, textColor[variant]]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.danger },
  ghost: { backgroundColor: 'transparent' },
  text: { fontSize: 16, fontWeight: '600' },
});
const textColor = StyleSheet.create({
  primary: { color: colors.onPrimary },
  secondary: { color: colors.primaryDark },
  danger: { color: colors.onPrimary },
  ghost: { color: colors.primary },
});
