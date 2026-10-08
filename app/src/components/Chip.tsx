import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, TAP } from '../theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
};

const tones = {
  neutral: { bg: colors.primarySoft, fg: colors.primaryDark },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Chip({ label, selected, onPress, tone = 'neutral' }: Props) {
  const t = tones[tone];
  const interactive = !!onPress;
  return (
    <Pressable
      disabled={!interactive}
      onPress={onPress}
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.primary : t.bg },
        interactive && { minHeight: TAP },
      ]}
    >
      <Text style={{ color: selected ? colors.onPrimary : t.fg, fontWeight: '600', fontSize: 14 }}>
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
});
