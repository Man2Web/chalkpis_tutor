import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, Chip, EmptyState, ListItem, Screen, Skeleton } from '../../components';
import { useAttendanceRange, useBatches, useStudents } from '../../data/hooks';
import { rangeFor, todayYmd, type RangePreset } from '../../lib/dates';
import { LOW_ATTENDANCE_PERCENT } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { batchStats, lowAttendance, overallStat, studentStats } from './logic';

const PRESETS: RangePreset[] = ['thisMonth', 'lastMonth', 'last30'];

export function AttendanceReportScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'AttendanceReport'>) {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<RangePreset>('thisMonth');
  const [batchId, setBatchId] = useState<string>();
  const { from, to } = rangeFor(preset, todayYmd());
  const docs = useAttendanceRange(from, to, batchId);
  const students = useStudents();
  const batches = useBatches();

  const data = useMemo(() => {
    const list = docs.data ?? [];
    const stats = studentStats(list);
    return {
      overall: overallStat(list),
      stats,
      low: lowAttendance(stats),
      perBatch: batchStats(list),
    };
  }, [docs.data]);

  const nameOf = (id: string) => students.data?.find((s) => s.id === id);
  const rows = [...data.stats].sort((a, b) => (a[1].pct ?? 101) - (b[1].pct ?? 101));
  const loading = docs.isLoading || students.isLoading || batches.isLoading;

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={type.title}>{t('attendance.reports')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {PRESETS.map((p) => (
            <Chip
              key={p}
              label={t(`attendance.range.${p}`)}
              selected={preset === p}
              onPress={() => setPreset(p)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <Chip
            label={t('attendance.allBatches')}
            selected={!batchId}
            onPress={() => setBatchId(undefined)}
          />
          {(batches.data ?? [])
            .filter((b) => b.status === 'active')
            .map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                selected={batchId === b.id}
                onPress={() => setBatchId(batchId === b.id ? undefined : b.id)}
              />
            ))}
        </View>

        {loading ? (
          <Skeleton height={96} />
        ) : docs.isError ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t('common.error')}
            actionLabel={t('common.retry')}
            onAction={() => void docs.refetch()}
          />
        ) : data.overall.sessions === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={t('attendance.noData')}
            message={t('attendance.noDataHint')}
          />
        ) : (
          <>
            <Card style={{ gap: spacing.xs }}>
              <Text style={type.caption}>{t('attendance.average')}</Text>
              <Text style={[type.title, { fontSize: 32 }]}>{data.overall.pct}%</Text>
              <Text style={type.caption}>
                {t('attendance.sessions', { count: data.overall.sessions })}
              </Text>
              {data.overall.holidays > 0 ? (
                <Text style={type.caption}>
                  {t('attendance.holidaysExcluded', { count: data.overall.holidays })}
                </Text>
              ) : null}
            </Card>

            {!batchId && data.perBatch.size > 1 ? (
              <Card style={{ gap: spacing.sm }}>
                <Text style={type.heading}>{t('attendance.byBatch')}</Text>
                {[...data.perBatch].map(([id, s]) => (
                  <View key={id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={type.body}>
                      {batches.data?.find((b) => b.id === id)?.name ?? '—'}
                    </Text>
                    <Text style={type.label}>{s.pct === null ? '—' : `${s.pct}%`}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card
              style={{
                gap: spacing.sm,
                borderColor: data.low.length ? colors.danger : colors.border,
              }}
            >
              <Text style={type.heading}>
                {t('attendance.lowTitle', { percent: LOW_ATTENDANCE_PERCENT })}
              </Text>
              {data.low.length === 0 ? (
                <Text style={type.caption}>{t('attendance.noneLow')}</Text>
              ) : (
                data.low.map(({ studentId, stat }) => (
                  <ListItem
                    key={studentId}
                    title={nameOf(studentId)?.name ?? '—'}
                    subtitle={t('attendance.breakdown', {
                      p: stat.present,
                      l: stat.late,
                      a: stat.absent,
                    })}
                    left={
                      <Avatar
                        name={nameOf(studentId)?.name ?? '?'}
                        uri={nameOf(studentId)?.photoUrl}
                        size={40}
                      />
                    }
                    right={<Chip label={`${stat.pct}%`} tone="danger" />}
                    onPress={() => navigation.navigate('StudentProfile', { id: studentId })}
                  />
                ))
              )}
            </Card>

            <Text style={type.heading}>{t('attendance.allStudents')}</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
              {rows.map(([id, s]) => (
                <ListItem
                  key={id}
                  title={nameOf(id)?.name ?? '—'}
                  subtitle={t('attendance.breakdown', { p: s.present, l: s.late, a: s.absent })}
                  right={
                    <Chip
                      label={s.pct === null ? '—' : `${s.pct}%`}
                      tone={s.pct !== null && s.pct < LOW_ATTENDANCE_PERCENT ? 'danger' : 'success'}
                    />
                  }
                  onPress={() => navigation.navigate('StudentProfile', { id })}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
