import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Chip,
  EmptyState,
  InsetSeparator,
  ListItem,
  listCard,
  Screen,
  Skeleton,
} from '../../components';
import { useAttendanceOn, useBatches } from '../../data/hooks';
import { todayYmd, weekdayOf } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { useIsStaff } from '../auth/session';
import { scheduleLabel } from '../batches/format';
import { DateStrip } from './DateStrip';
import { counts } from './logic';

export function AttendanceHomeScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const [date, setDate] = useState(todayYmd());
  const batches = useBatches();
  const day = useAttendanceOn(date);
  const staff = useIsStaff();

  const active = (batches.data ?? []).filter((b) => b.status === 'active');
  // Batches that meet on this weekday first.
  const weekday = weekdayOf(date);
  const sorted = [...active].sort(
    (a, b) => Number(b.days.includes(weekday)) - Number(a.days.includes(weekday)),
  );
  const byBatch = new Map((day.data ?? []).map((d) => [d.batchId, d]));

  const status = (batchId: string) => {
    const d = byBatch.get(batchId);
    if (!d) return <Chip label={t('attendance.notMarked')} tone="warning" />;
    if (d.holiday)
      return (
        <Chip label={t(d.reason === 'cancelled' ? 'attendance.cancelled' : 'attendance.holiday')} />
      );
    const c = counts(Object.values(d.marks));
    return (
      <Chip
        label={t('attendance.presentOf', { present: c.P + c.L, total: c.P + c.L + c.A })}
        tone="success"
      />
    );
  };

  if (batches.isError || day.isError) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void batches.refetch();
            void day.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={type.largeTitle}>{t('tabs.attendance')}</Text>
          <Button
            variant="secondary"
            size="small"
            title={t('attendance.reports')}
            onPress={() => nav.navigate('AttendanceReport')}
          />
        </View>
        <DateStrip date={date} onChange={setDate} />
        <Text style={type.caption}>{t('attendance.pickBatch')}</Text>
      </View>
      {batches.isLoading || day.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={listCard}
          data={sorted}
          keyExtractor={(b) => b.id}
          refreshControl={
            <RefreshControl
              refreshing={day.isRefetching}
              onRefresh={() => {
                void batches.refetch();
                void day.refetch();
              }}
            />
          }
          ItemSeparatorComponent={InsetSeparator}
          ListEmptyComponent={
            staff ? (
              <EmptyState
                icon="albums-outline"
                title={t('batches.emptyTitle')}
                message={t('attendance.noBatchesAssigned')}
              />
            ) : (
              <EmptyState
                icon="albums-outline"
                title={t('batches.emptyTitle')}
                message={t('batches.emptyMessage')}
                actionLabel={t('batches.add')}
                onAction={() => nav.navigate('BatchForm')}
              />
            )
          }
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={`${item.days.includes(weekday) ? `${t('attendance.classToday')} • ` : ''}${scheduleLabel(item, t)}`}
              right={status(item.id)}
              onPress={() => nav.navigate('MarkAttendance', { batchId: item.id, date })}
            />
          )}
        />
      )}
    </Screen>
  );
}
