import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';
import { Button } from './Button';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon = 'folder-open-outline',
  title,
  message,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={34} color={colors.gray} />
      </View>
      <Text style={[type.title3, styles.center]}>{title}</Text>
      {!!message && (
        <Text style={[type.subhead, styles.center, { color: colors.textMuted }]}>{message}</Text>
      )}
      {!!actionLabel && !!onAction && <Button title={actionLabel} onPress={onAction} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md, padding: spacing.xxl },
  center: { textAlign: 'center', maxWidth: 320 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
