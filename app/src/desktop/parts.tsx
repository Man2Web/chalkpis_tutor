import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type PressableStateCallbackType,
  type ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Progress } from 'panelui-native/components/progress';
import { Avatar } from '../components';
import { colors, font, radius, shadow, spacing, type } from '../theme';

/** The sidebar's width; the page column is what is left of the window. */
export const SIDEBAR_WIDTH = 248;
/** Widest a desktop page gets, so tables and cards do not stretch across a large monitor. */
export const PAGE_MAX = 1320;
const PAGE_PAD = 32;

/** RN Web adds `hovered` to a Pressable's state. */
export type HoverState = PressableStateCallbackType & { hovered?: boolean };

/** Width of the page column inside the desktop frame (for grids that pick their number of columns). */
export function usePageWidth() {
  const { width } = useWindowDimensions();
  return Math.min(PAGE_MAX, width - SIDEBAR_WIDTH - PAGE_PAD * 2);
}

/**
 * A desktop page: a title row with its own actions on the right, then the content, in a column that stops growing
 * on a large monitor.
 */
export function DesktopPage({
  eyebrow,
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: PAGE_PAD, paddingBottom: 56 }}
    >
      <View style={{ width: '100%', maxWidth: PAGE_MAX, alignSelf: 'center', gap: spacing.xl }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            gap: spacing.lg,
          }}
        >
          <View style={{ flex: 1, minWidth: 260, gap: 2 }}>
            {eyebrow ? <Text style={type.footnote}>{eyebrow}</Text> : null}
            <Text style={type.largeTitle} accessibilityRole="header" numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[type.subhead, { color: colors.textMuted }]}>{subtitle}</Text>
            ) : null}
          </View>
          {actions ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              {actions}
            </View>
          ) : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
const TONE: Record<Tone, { ink: string; soft: string }> = {
  neutral: { ink: colors.text, soft: colors.fill },
  success: { ink: colors.success, soft: colors.successSoft },
  warning: { ink: colors.warning, soft: colors.warningSoft },
  danger: { ink: colors.danger, soft: colors.dangerSoft },
  info: { ink: colors.info, soft: colors.infoSoft },
};

/** One number on a desktop dashboard: label and icon, the figure, a line under it, and optionally a progress bar. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  valueTone,
  progress,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  /** Colour of the figure itself; the icon always takes `tone`. */
  valueTone?: Tone;
  /** 0-1 */
  progress?: number | null;
  onPress?: () => void;
}) {
  const c = TONE[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={(s: HoverState) => [
        card,
        { flex: 1, minWidth: 200, gap: spacing.sm, padding: 20 },
        onPress && s.hovered ? { borderColor: colors.ring } : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={[type.footnote, font('500'), { flex: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: radius.md,
            backgroundColor: c.soft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={17} color={c.ink} />
        </View>
      </View>
      <Text
        style={[type.title1, { fontSize: 28, color: TONE[valueTone ?? 'neutral'].ink }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {progress !== undefined && progress !== null ? (
        <Progress value={Math.round(Math.min(1, progress) * 100)} color="success" size="sm" />
      ) : null}
      {sub ? (
        <Text style={type.caption} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Narrowest a stat card may get before the row breaks into two. */
const STAT_MIN = 200;

/**
 * The row of stat cards at the top of a page: all in one row when they fit, otherwise two per row, so a narrow
 * laptop never shows three cards and a lonely fourth.
 */
export function StatGrid({ children }: { children: ReactNode[] }) {
  const pageWidth = usePageWidth();
  const items = children.filter(Boolean);
  const n = items.length;
  const cols = pageWidth >= n * STAT_MIN + (n - 1) * spacing.lg ? n : Math.min(2, n);
  const w = (pageWidth - spacing.lg * (cols - 1)) / cols;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
      {items.map((c, i) => (
        <View key={i} style={{ width: w, flexDirection: 'row' }}>
          {c}
        </View>
      ))}
    </View>
  );
}

/** The bordered white card every desktop panel sits on. */
export const card: ViewStyle = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: radius.lg,
};

/** A plain text action ("View all") for a panel's header. */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8}>
      {(s: HoverState) => (
        <Text
          style={[
            type.subhead,
            font('500'),
            { color: colors.info, textDecorationLine: s.hovered ? 'underline' : 'none' },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A row's main text as a link (with the person's avatar if given), for a table whose rows hold their own buttons:
 * the row itself cannot be the button, because a button may not sit inside another.
 */
export function CellLink({
  label,
  onPress,
  avatar,
}: {
  label: string;
  onPress: () => void;
  avatar?: { name: string; uri?: string | null };
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      {(s: HoverState) => (
        <>
          {avatar ? <Avatar name={avatar.name} uri={avatar.uri} size={32} /> : null}
          <Text
            style={[
              type.subhead,
              font('600'),
              { flex: 1, textDecorationLine: s.hovered ? 'underline' : 'none' },
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

/**
 * A compact select for a toolbar: the chosen option on a button, and a menu of options under it. Picking the first
 * option ("All batches") usually means no filter. Like any menu it closes on a click anywhere else and on Escape.
 */
export function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  width = 200,
}: {
  /** Read by screen readers, e.g. "Batch". */
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<View>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  // the browser version only (the desktop pages never run in the phone apps): a press outside the menu, or Escape,
  // closes it. Listening on the page is sturdier than an invisible backdrop, which other layers could sit above.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const node = box.current as unknown as HTMLElement | null;
    const onDown = (e: MouseEvent) => {
      if (node && !node.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <View ref={box} style={{ width, zIndex: open ? 30 : 1 }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open }}
        style={(s: HoverState) => [
          {
            height: 40,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            paddingHorizontal: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: open || s.hovered ? colors.ring : colors.input,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text style={[type.subhead, { flex: 1 }]} numberOfLines={1}>
          {current?.label}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View
          style={[
            card,
            shadow.raised,
            {
              position: 'absolute',
              top: 44,
              left: 0,
              minWidth: width,
              maxHeight: 320,
              borderRadius: radius.md,
              paddingVertical: spacing.xs,
            },
          ]}
        >
          <ScrollView>
            {options.map((o) => (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
                style={(s: HoverState) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: 9,
                  backgroundColor: s.hovered ? colors.fill : 'transparent',
                })}
              >
                <Text style={[type.subhead, { flex: 1 }]} numberOfLines={1}>
                  {o.label}
                </Text>
                {o.value === value ? (
                  <Ionicons name="checkmark" size={16} color={colors.text} />
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/** Columns that sit side by side on a wide window and stack on a narrower laptop. */
export function Split({
  main,
  side,
  sideWidth = 360,
  stackBelow = 1100,
}: {
  main: ReactNode;
  side: ReactNode;
  sideWidth?: number;
  /** Page widths under this stack the side column under the main one. */
  stackBelow?: number;
}) {
  const stacked = usePageWidth() < stackBelow;
  return (
    <View
      style={{
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'stretch' : 'flex-start',
        gap: spacing.xl,
      }}
    >
      <View style={{ flex: stacked ? undefined : 1, minWidth: 0, gap: spacing.xl }}>{main}</View>
      <View style={{ width: stacked ? '100%' : sideWidth, gap: spacing.xl }}>{side}</View>
    </View>
  );
}
