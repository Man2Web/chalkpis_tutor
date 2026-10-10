import { StyleSheet, View } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

/** Rounded white card that holds a list, same look on every screen. */
export const listCard = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadow.card,
  },
}).card;

/** Hairline between rows, starting after the avatar like iOS lists. */
export function InsetSeparator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
});
