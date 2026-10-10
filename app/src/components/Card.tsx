import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

export function Card({ style, ...rest }: ViewProps) {
  return <View style={[styles.card, style]} {...rest} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadow.card,
  },
});
