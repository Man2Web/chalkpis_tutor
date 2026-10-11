import { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { TAP, type, spacing } from '../theme';
import { Logo } from './Logo';

/** Top of each main tab: the Chalkpis logo (Home) or the tab's title, and one optional action on the right. */
export function TopBar({ title, right }: { title?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: TAP }}>
      <View style={{ flex: 1 }} accessibilityRole="header">
        {title ? (
          <Text style={[type.largeTitle, { fontSize: 28, lineHeight: 34 }]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Logo height={26} />
        )}
      </View>
      {right}
    </View>
  );
}
