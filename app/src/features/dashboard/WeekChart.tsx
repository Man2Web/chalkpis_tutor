import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components';
import { weekdayOf } from '../../lib/dates';
import { colors, radius, spacing, type } from '../../theme';
import { markingStreak, type DayPoint } from './logic';

const BAR_MAX = 72;

/** Seven bars, one per day: how many were present. Grey stub when nothing was marked. */
export function WeekChart({ points, today }: { points: DayPoint[]; today: string }) {
  const { t } = useTranslation();
  const streak = markingStreak(points);
  const marked = points.some((p) => p.pct !== null);
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={type.heading}>{t('week.title')}</Text>
        <Text style={type.caption}>
          {!marked
            ? t('week.noMarks')
            : streak > 0
              ? t('week.streak', { count: streak })
              : t('week.last7')}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: spacing.sm,
          height: BAR_MAX + 22,
        }}
        accessibilityLabel={points
          .map((p) => `${p.date}: ${p.pct === null ? '-' : `${p.pct}%`}`)
          .join(', ')}
      >
        {points.map((p) => {
          const isToday = p.date === today;
          const h = p.pct === null ? 4 : Math.max(6, (p.pct / 100) * BAR_MAX);
          const tone =
            p.pct === null
              ? colors.border
              : p.pct >= 75
                ? colors.success
                : p.pct >= 50
                  ? colors.warning
                  : colors.danger;
          return (
            <View key={p.date} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              {p.pct !== null ? (
                <Text style={{ fontSize: 10, color: colors.textMuted }}>{p.pct}</Text>
              ) : null}
              <View
                style={{
                  width: '70%',
                  height: h,
                  borderRadius: radius.sm / 2,
                  backgroundColor: tone,
                  opacity: isToday ? 1 : 0.85,
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: isToday ? '700' : '500',
                  color: isToday ? colors.primary : colors.textMuted,
                }}
              >
                {isToday ? t('week.today') : t(`week.days.${weekdayOf(p.date)}`)}
              </Text>
            </View>
          );
        })}
      </View>
      {!marked ? <Text style={type.caption}>{t('week.hint')}</Text> : null}
    </Card>
  );
}
