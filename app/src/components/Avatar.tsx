import { Image, StyleSheet, Text, View } from 'react-native';
import { tintFor } from '../theme';

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
  const tint = tintFor(name);
  return (
    <View style={[styles.fallback, box, { backgroundColor: tint.bg }]} accessibilityLabel={name}>
      <Text style={{ color: tint.ink, fontWeight: '600', fontSize: size * 0.38 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
