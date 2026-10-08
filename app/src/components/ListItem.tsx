import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, TAP, type } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
};

export function ListItem({ title, subtitle, left, right, onPress }: Props) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.primarySoft }]}
    >
      {left}
      <View style={styles.body}>
        <Text style={type.body} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={type.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TAP + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  body: { flex: 1, gap: 2 },
});
