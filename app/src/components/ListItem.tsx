import { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, TAP, type } from '../theme';

type Props = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** Shown under the subtitle (for example a status chip), so long names are not squeezed. */
  below?: ReactNode;
  onPress?: () => void;
};

export function ListItem({ title, subtitle, left, right, below, onPress }: Props) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      android_ripple={onPress ? { color: 'rgba(0,0,0,0.08)' } : undefined}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS !== 'android' && { backgroundColor: '#E5E5EA' },
      ]}
    >
      {left}
      <View style={styles.body}>
        <Text style={[type.body, styles.title]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={type.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {below}
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
  body: { flex: 1, gap: 3 },
  title: { fontWeight: '500' },
});
