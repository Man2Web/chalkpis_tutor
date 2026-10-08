import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Card, Chip, Skeleton } from '../../components';
import { useAttendanceRange } from '../../data/hooks';
import { rangeFor, todayYmd } from '../../lib/dates';
import { LOW_ATTENDANCE_PERCENT } from '../../lib/types';
import { spacing, type } from '../../theme';
import { overallStat, studentStats } from './logic';

type Props = { studentId?: string; batchId?: string };

/** Last 30 days for one student (across batches) or one batch. */
export function AttendanceSummary({ studentId, batchId }: Props) {
  const { t } = useTranslation();
  const { from, to } = rangeFor('last30', todayYmd());
  const docs = useAttendanceRange(from, to, studentId ? undefined : batchId);

  const stat = studentId
    ? studentStats(docs.data ?? []).get(studentId)
    : overallStat(docs.data ?? []);
  const low = stat?.pct != null && stat.pct < LOW_ATTENDANCE_PERCENT;

  return (
    <Card style={{ gap: spacing.xs }}>
      <Text style={type.heading}>{t('attendance.last30')}</Text>
      {docs.isLoading ? (
        <Skeleton height={40} />
      ) : !stat || stat.pct === null ? (
        <Text style={type.caption}>{t('attendance.noData')}</Text>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={[type.title, { fontSize: 28 }]}>{stat.pct}%</Text>
            {low ? <Chip label={t('attendance.low')} tone="danger" /> : null}
          </View>
          <Text style={type.caption}>
            {t('attendance.breakdown', { p: stat.present, l: stat.late, a: stat.absent })}
          </Text>
        </View>
      )}
    </Card>
  );
}
