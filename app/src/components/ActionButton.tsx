import { Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { haptic } from '../lib/haptics';
import { colors, radius, spacing } from '../theme';

/** The rounded icon buttons under a contact's name in iOS Contacts (call, message, ...). */
export function ActionButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 4,
        paddingVertical: spacing.sm + 2,
        borderRadius: radius.md - 2,
        backgroundColor: pressed && Platform.OS !== 'android' ? '#E5E5EA' : colors.surface,
        opacity: disabled ? 0.4 : 1,
        overflow: 'hidden',
      })}
    >
      <View style={{ height: 26, justifyContent: 'center' }}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text
        style={{ fontSize: 12, fontWeight: '500', color: colors.primaryDark }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}
