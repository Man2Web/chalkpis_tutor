import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'panelui-native/components/calendar';
import { haptic } from '../../lib/haptics';
import { addDays, prettyDate, todayYmd } from '../../lib/dates';
import { colors, radius, spacing, TAP, type } from '../../theme';

type Props = { date: string; onChange: (date: string) => void };

/** "2026-10-11" as a local Date (midnight), and back. */
const toDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
};
const toYmdLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The day being looked at: step a day back or forward with the arrows, or tap the date to open a PanelUI calendar
 * and jump to any day. Future days cannot be picked (attendance is never marked ahead).
 */
export function DateStrip({ date, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const today = todayYmd();
  const isToday = date === today;

  const arrow = (dir: -1 | 1, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(dir === -1 ? 'attendance.prevDay' : 'attendance.nextDay')}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={() => {
        haptic.select();
        onChange(addDays(date, dir));
      }}
      style={{
        width: TAP,
        minHeight: TAP,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons
        name={dir === -1 ? 'chevron-back' : 'chevron-forward'}
        size={22}
        color={colors.text}
      />
    </Pressable>
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.surface,
          borderRadius: radius.md + 2,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: spacing.xs,
        }}
      >
        {arrow(-1, false)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${prettyDate(date, 'en-IN')}, ${t(open ? 'attendance.closeCalendar' : 'attendance.openCalendar')}`}
          aria-expanded={open}
          onPress={() => {
            haptic.tap();
            setOpen((o) => !o);
          }}
          style={{
            flex: 1,
            alignItems: 'center',
            minHeight: TAP,
            justifyContent: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
            <Text style={type.heading}>{prettyDate(date, 'en-IN')}</Text>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.textMuted}
            />
          </View>
          <Text style={type.caption}>
            {isToday ? t('attendance.today') : t('attendance.pickDate')}
          </Text>
        </Pressable>
        {arrow(1, isToday)}
      </View>

      {open ? (
        <View style={{ gap: spacing.sm }}>
          <Calendar
            mode="single"
            selected={toDate(date)}
            defaultMonth={toDate(date)}
            maxDate={toDate(today)}
            weekStartsOn={1}
            onSelect={(d) => {
              if (!d) return;
              haptic.select();
              onChange(toYmdLocal(d));
              setOpen(false);
            }}
          />
          {!isToday ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                haptic.tap();
                onChange(today);
                setOpen(false);
              }}
              style={{
                alignSelf: 'center',
                minHeight: 44,
                justifyContent: 'center',
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
              }}
            >
              <Text style={[type.label, { color: colors.text }]}>{t('attendance.goToToday')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
