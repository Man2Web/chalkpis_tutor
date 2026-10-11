import { ReactNode } from 'react';
import { View } from 'react-native';
import { Item } from 'panelui-native/components/item';

type Props = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  /** Shown under the subtitle (for example a status chip), so long names are not squeezed. */
  below?: ReactNode;
  onPress?: () => void;
};

/** A list row (PanelUI Item): avatar or icon, title and subtitle, and something on the right. */
export function ListItem({ title, subtitle, left, right, below, onPress }: Props) {
  return (
    <Item
      onPress={onPress}
      disabled={false}
      accessibilityRole={onPress ? 'button' : undefined}
      // read as "Ananya Rao, Class 9 • Maths 10", not the avatar's initials run into the name
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      className="min-h-16 rounded-none bg-card px-4 py-3"
    >
      {left ? <Item.Media>{left}</Item.Media> : null}
      <Item.Content>
        <Item.Title numberOfLines={1}>{title}</Item.Title>
        {subtitle ? <Item.Description numberOfLines={1}>{subtitle}</Item.Description> : null}
        {below ? <View className="mt-1 flex-row">{below}</View> : null}
      </Item.Content>
      {right ? <Item.Actions>{right}</Item.Actions> : null}
    </Item>
  );
}
