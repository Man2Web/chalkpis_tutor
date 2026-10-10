import { Pressable, StyleSheet, Text } from 'react-native';
import { haptic } from '../lib/haptics';
import { colors, radius, spacing, TAP } from '../theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  /** Compact status label for list rows. */
  small?: boolean;
};

const tones = {
  neutral: { bg: colors.fill, fg: colors.text },
  accent: { bg: colors.primarySoft, fg: colors.primaryDark },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Chip({ label, selected, onPress, tone = 'neutral', small }: Props) {
  const t = tones[tone];
  const interactive = !!onPress;
  return (
    <Pressable
      disabled={!interactive}
      onPress={
        onPress
          ? () => {
              haptic.select();
              onPress();
            }
          : undefined
      }
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.primary : t.bg },
        interactive && !small && { minHeight: TAP },
        small && styles.small,
      ]}
      hitSlop={small && interactive ? 10 : undefined}
    >
      <Text
        style={{
          color: selected ? colors.onPrimary : t.fg,
          fontWeight: selected ? '600' : '500',
          fontSize: small ? 13 : 15,
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
});
