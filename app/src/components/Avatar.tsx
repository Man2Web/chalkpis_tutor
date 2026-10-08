import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = { name: string; uri?: string | null; size?: number };

export function Avatar({ name, uri, size = 44 }: Props) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (uri) return <Image source={{ uri }} style={box} accessibilityLabel={name} />;
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View style={[styles.fallback, box]} accessibilityLabel={name}>
      <Text style={{ color: colors.primaryDark, fontWeight: '700', fontSize: size * 0.38 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
});
