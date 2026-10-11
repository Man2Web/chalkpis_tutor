import { ReactNode } from 'react';
import { Text, View, ViewProps, ViewStyle } from 'react-native';
import { Card as PanelCard } from 'panelui-native/components/card';

/** PanelUI Card with comfortable padding; pass `style` to change the padding or layout. */
export function Card({ style, ...rest }: ViewProps) {
  return <PanelCard className="p-4" style={style} {...rest} />;
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
    <PanelCard className="overflow-hidden" style={style}>
      {title || right ? (
        <View className="min-h-11 flex-row items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
          {title ? (
            <Text
              className="flex-1 text-sm font-medium text-muted-foreground"
              numberOfLines={1}
              accessibilityRole="header"
            >
              {title}
            </Text>
          ) : (
            <View />
          )}
          {typeof right === 'string' ? (
            <Text className="text-sm text-muted-foreground">{right}</Text>
          ) : (
            right
          )}
        </View>
      ) : null}
      <View className={padded ? 'p-4' : undefined} style={bodyStyle}>
        {children}
      </View>
    </PanelCard>
  );
}
