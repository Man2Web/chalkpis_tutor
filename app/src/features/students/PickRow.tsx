import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from '../../components';
import { haptic } from '../../lib/haptics';
import { colors, spacing, TAP, type } from '../../theme';

type Props = {
  title: string;
  subtitle?: string;
  photoUrl?: string | null;
  checked: boolean;
  onToggle: () => void;
};

/**
 * One person in a multi-select list (adding students to a batch, picking contacts): avatar, name, and a tick on the
 * right, read out as a checkbox. A full-width chip per row looked like a button and hid which ones were picked.
 */
export function PickRow({ title, subtitle, photoUrl, checked, onToggle }: Props) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      onPress={() => {
        haptic.select();
        onToggle();
      }}
      style={({ pressed }) => ({
        minHeight: TAP + 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.xs,
        backgroundColor: pressed ? colors.fill : checked ? colors.primarySoft : 'transparent',
      })}
    >
      <Avatar name={title} uri={photoUrl} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={type.body} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={type.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={checked ? colors.primary : colors.textFaint}
      />
    </Pressable>
  );
}
