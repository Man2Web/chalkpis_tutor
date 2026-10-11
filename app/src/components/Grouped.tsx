import { Children, isValidElement, ReactNode } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from 'panelui-native/components/card';
import { Item } from 'panelui-native/components/item';
import { Switch } from 'panelui-native/components/switch';
import { Tabs } from 'panelui-native/components/tabs';
import { haptic } from '../lib/haptics';
import { colors } from '../theme';

/**
 * A grouped list (PanelUI Card + Item rows): an optional small header, rows divided by hairlines, and an optional
 * footer note under the card.
 */
export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className="mb-6">
      {title ? (
        <Text
          className="mb-2 ml-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          accessibilityRole="header"
        >
          {title}
        </Text>
      ) : null}
      <Card className="overflow-hidden">
        {rows.map((row, i) => (
          <View key={(row.key as string) ?? i}>
            {row}
            {i < rows.length - 1 ? <View className="ml-4 h-px bg-border" /> : null}
          </View>
        ))}
      </Card>
      {footer ? (
        <Text className="mx-1 mt-2 font-normal text-xs text-muted-foreground">{footer}</Text>
      ) : null}
    </View>
  );
}

/** Soft tinted rounded-square icon at the start of a row: tinted fill, coloured glyph. */
export function IconTile({
  name,
  color,
  size = 32,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: /^#[0-9a-f]{6}$/i.test(color) ? `${color}1A` : colors.fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size * 0.55} color={color} />
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  /** Grey text on the right, e.g. the current value. */
  value?: string;
  onPress?: () => void;
  /** Shows a switch instead of a chevron. */
  toggle?: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean };
  destructive?: boolean;
  /** Custom content on the right (instead of value / chevron). */
  right?: ReactNode;
};

/** One list row (PanelUI Item): icon, title (and subtitle), value, then a chevron or a switch. */
export function Row({
  title,
  subtitle,
  icon,
  iconColor = colors.primary,
  value,
  onPress,
  toggle,
  destructive,
  right,
}: RowProps) {
  const label = toggle ? undefined : [title, value].filter(Boolean).join(', ');
  return (
    <Item
      size="sm"
      onPress={onPress}
      disabled={toggle?.disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      // the value is read out with the title ("Language, English"), for buttons too
      accessibilityLabel={label ?? (onPress ? title : undefined)}
      accessible={!toggle}
      className="min-h-12 rounded-none px-4"
    >
      {icon ? (
        <Item.Media>
          <IconTile name={icon} color={destructive ? colors.dangerFill : iconColor} />
        </Item.Media>
      ) : null}
      <Item.Content>
        <Item.Title
          className={destructive ? 'text-base text-destructive' : 'text-base'}
          numberOfLines={value ? 1 : 2}
        >
          {title}
        </Item.Title>
        {subtitle ? <Item.Description numberOfLines={2}>{subtitle}</Item.Description> : null}
      </Item.Content>
      {right || value || toggle || (onPress && !destructive) ? (
        <Item.Actions>
          {right}
          {value ? (
            <Text
              className="max-w-[50%] shrink font-normal text-base text-muted-foreground"
              numberOfLines={1}
            >
              {value}
            </Text>
          ) : null}
          {toggle ? (
            <Switch
              value={toggle.value}
              disabled={toggle.disabled}
              haptics={false}
              accessibilityLabel={title}
              onValueChange={(v) => {
                haptic.select();
                toggle.onChange(v);
              }}
            />
          ) : onPress && !destructive ? (
            <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
          ) : null}
        </Item.Actions>
      ) : null}
    </Item>
  );
}

/** PanelUI segmented tabs, used as a plain picker: the chosen option slides under a white pill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Tabs
      variant="segmented"
      value={value}
      defaultValue={value}
      onValueChange={(v) => {
        if (v !== value) {
          haptic.select();
          onChange(v as T);
        }
      }}
    >
      <Tabs.List>
        {options.map((o) => (
          <Tabs.Trigger key={o.value} value={o.value}>
            {o.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
