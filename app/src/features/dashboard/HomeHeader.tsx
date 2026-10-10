import { Image, Pressable, Text, View } from 'react-native';
import { Avatar } from '../../components';
import { haptic } from '../../lib/haptics';
import { colors, spacing } from '../../theme';
import appIcon from '../../../assets/icon.png';

/** Top bar of Home: the Chalkpis logo on the left, the tutor's photo (opens Profile) on the right. */
export function HomeHeader({ name, onProfile }: { name: string; onProfile: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        accessibilityRole="header"
        accessibilityLabel="Chalkpis"
      >
        <Image
          source={appIcon}
          style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            borderWidth: 0.5,
            borderColor: colors.border,
          }}
        />
        <Text style={{ fontSize: 20, fontWeight: '700', letterSpacing: -0.3, color: colors.text }}>
          Chalkpis
        </Text>
      </View>
      <Pressable
        onPress={() => {
          haptic.tap();
          onProfile();
        }}
        accessibilityRole="button"
        accessibilityLabel={name}
        hitSlop={8}
      >
        <Avatar name={name || '?'} size={36} />
      </Pressable>
    </View>
  );
}

/** Good morning / afternoon / evening, by the time in India. */
export function greetingKey(now: Date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Kolkata',
    }).format(now),
  );
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}
