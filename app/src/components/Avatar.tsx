import { View } from 'react-native';
import { Avatar as PanelAvatar } from 'panelui-native/components/avatar';
import { imageSource } from '../api/client';
import { tintFor } from '../theme';

type Props = { name: string; uri?: string | null; size?: number };

/** PanelUI Avatar: the photo, or initials on a soft colour that is the same for the same name every time. */
export function Avatar({ name, uri, size = 44 }: Props) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const tint = tintFor(name);
  return (
    <View accessibilityLabel={name} style={{ width: size, height: size }}>
      <PanelAvatar
        size={size >= 72 ? 'xl' : size >= 52 ? 'lg' : size >= 38 ? 'md' : 'sm'}
        source={uri ? imageSource(uri) : undefined}
        fallback={initials || '?'}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint.bg }}
      />
    </View>
  );
}
