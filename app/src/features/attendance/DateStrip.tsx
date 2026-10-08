import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { addDays, prettyDate, todayYmd } from '../../lib/dates';
import { colors, radius, spacing, TAP, type } from '../../theme';

type Props = { date: string; onChange: (date: string) => void };

/** Previous/next day with a label; cannot go into the future. */
export function DateStrip({ date, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const today = todayYmd();
  const isToday = date === today;
  const arrow = (dir: -1 | 1, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(dir === -1 ? 'attendance.prevDay' : 'attendance.nextDay')}
      disabled={disabled}
      onPress={() => onChange(addDays(date, dir))}
      style={{
        width: TAP,
        height: TAP,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons
        name={dir === -1 ? 'chevron-back' : 'chevron-forward'}
        size={24}
        color={colors.primary}
      />
    </Pressable>
  );
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.xs,
      }}
    >
      {arrow(-1, false)}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(today)}
        disabled={isToday}
        style={{ alignItems: 'center', minHeight: TAP, justifyContent: 'center' }}
      >
        <Text style={type.heading}>
          {prettyDate(date, i18n.language === 'hi' ? 'hi-IN' : 'en-IN')}
        </Text>
        <Text style={type.caption}>
          {isToday ? t('attendance.today') : t('attendance.tapForToday')}
        </Text>
      </Pressable>
      {arrow(1, isToday)}
    </View>
  );
}
