import { ReactNode } from 'react';
import { Text, View, ViewProps, ViewStyle } from 'react-native';
import { Card as PanelCard } from 'panelui-native/components/card';

/** PanelUI Card with comfortable padding and a hairline border (no drop shadow); `style` changes padding or layout. */
export function Card({ style, ...rest }: ViewProps) {
  return <PanelCard className="p-4 shadow-none" style={style} {...rest} />;
}

/**
 * A titled PanelUI card: a small header (title on the left, a value or action on the right) above the content,
 * divided by a hairline.
 */
export function Panel({
  title,
  right,
  children,
  padded = true,
  style,
  bodyStyle,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  style?: ViewStyle;
  bodyStyle?: ViewStyle;
}) {
  return (
    <PanelCard className="overflow-hidden shadow-none" style={style}>
      {title || right ? (
        <View className="flex-row items-center justify-between gap-2 px-4 pt-4">
          {title ? (
            <Text
              className="flex-1 text-[15px] font-semibold text-foreground"
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {typeof right === 'string' ? (
            <Text className="font-normal text-sm text-muted-foreground">{right}</Text>
          ) : (
            right
          )}
        </View>
      ) : null}
      <View className={padded ? 'p-4' : title || right ? 'pt-3' : undefined} style={bodyStyle}>
        {children}
      </View>
    </PanelCard>
  );
}
