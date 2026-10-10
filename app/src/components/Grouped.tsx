import { Children, isValidElement, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { haptic } from '../lib/haptics';
import { colors, radius, spacing, TAP, type } from '../theme';

/**
 * iOS "inset grouped" list section, as in the Settings app: an optional grey header, white rounded rows with
 * hairlines between them, and an optional footer note.
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
    <View style={styles.section}>
      {title ? (
        <Text style={styles.header} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>
        {rows.map((row, i) => (
          <View key={(row.key as string) ?? i}>
            {row}
            {i < rows.length - 1 ? <View style={styles.sep} /> : null}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

/** The coloured rounded-square icon used at the start of iOS settings rows. */
export function IconTile({
  name,
  color,
  size = 30,
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
        borderRadius: size * 0.23,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size * 0.6} color="#FFFFFF" />
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

/** One settings row: icon tile, title (and subtitle), value, then a chevron or a switch. */
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
  const content = (
    <>
      {icon ? <IconTile name={icon} color={destructive ? colors.dangerFill : iconColor} /> : null}
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={[type.body, destructive && { color: colors.danger }]}
          numberOfLines={value ? 1 : 2}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text style={type.footnote} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {value ? (
        <Text
          style={[type.body, { color: colors.textMuted, maxWidth: '50%', flexShrink: 1 }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
      {toggle ? (
        <Switch
          value={toggle.value}
          disabled={toggle.disabled}
          onValueChange={(v) => {
            haptic.select();
            toggle.onChange(v);
          }}
          trackColor={{ true: colors.successFill, false: undefined }}
          thumbColor={Platform.OS === 'android' ? '#FFFFFF' : undefined}
          accessibilityLabel={title}
        />
      ) : onPress && !destructive ? (
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      ) : null}
    </>
  );
  if (!onPress)
    return (
      <View
        style={[styles.row, toggle?.disabled && { opacity: 0.5 }]}
        accessible={!toggle}
        accessibilityLabel={toggle ? undefined : [title, value].filter(Boolean).join(', ')}
      >
        {content}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [
        styles.row,
        pressed && Platform.OS !== 'android' && { backgroundColor: '#E5E5EA' },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** iOS segmented control: a grey track with a white sliding pill on the chosen option. */
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
    <View style={styles.segTrack} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) {
                haptic.select();
                onChange(o.value);
              }
            }}
            style={[styles.seg, on && styles.segOn]}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: on ? '600' : '500',
                color: colors.text,
                letterSpacing: -0.08,
              }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  header: { ...type.sectionHeader, marginLeft: spacing.lg, marginBottom: 6 },
  footer: { ...type.footnote, marginHorizontal: spacing.lg, marginTop: 6 },
  group: { backgroundColor: colors.surface, borderRadius: radius.md - 2, overflow: 'hidden' },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
  row: {
    minHeight: TAP - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 11,
    backgroundColor: colors.surface,
  },
  segTrack: {
    flexDirection: 'row',
    backgroundColor: colors.fill,
    borderRadius: 9,
    padding: 2,
    gap: 2,
  },
  seg: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    paddingHorizontal: spacing.sm,
  },
  segOn: {
    backgroundColor: colors.surface,
    boxShadow: '0 3px 8px rgba(0,0,0,0.12), 0 1px 1px rgba(0,0,0,0.04)',
  },
});
