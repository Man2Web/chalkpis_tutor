import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BarChart } from 'panelui-native/components/bar-chart';
import { Panel } from '../../components';
import { weekdayOf } from '../../lib/dates';
import { colors, type } from '../../theme';
import { markingStreak, type DayPoint } from './logic';

/** PanelUI bar chart of the last seven days: the share present each day (touch a bar for the number). */
export function WeekChart({ points, today }: { points: DayPoint[]; today: string }) {
  const { t } = useTranslation();
  const streak = markingStreak(points);
  const marked = points.some((p) => p.pct !== null);
  return (
    <Panel
      title={t('week.title')}
      right={
        !marked
          ? t('week.noMarks')
          : streak > 0
            ? t('week.streak', { count: streak })
            : t('week.last7')
      }
    >
      <View
        accessibilityLabel={points
          .map((p) => `${p.date}: ${p.pct === null ? '-' : `${p.pct}%`}`)
          .join(', ')}
      >
        <BarChart
          data={points.map((p) => ({
            day: p.date === today ? t('week.today') : t(`week.days.${weekdayOf(p.date)}`),
            present: p.pct ?? 0,
          }))}
          xDataKey="day"
          aspectRatio={2.4}
        >
          <BarChart.Grid />
          <BarChart.Bar dataKey="present" color={colors.successFill} cornerRadius={6} />
          <BarChart.XAxis />
          <BarChart.Tooltip formatValue={(v) => `${v}% present`} />
        </BarChart>
      </View>
      {!marked ? <Text style={type.caption}>{t('week.hint')}</Text> : null}
    </Panel>
  );
}
