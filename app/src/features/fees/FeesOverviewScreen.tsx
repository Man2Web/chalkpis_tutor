import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  ListItem,
  Screen,
  Skeleton,
} from '../../components';
import { usePaymentsThisMonth, useStudents, useUnpaidDues } from '../../data/hooks';
import { prettyDate, todayYmd, toYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { groupByStudent, netCollected, totals } from './logic';

export function FeesOverviewScreen() {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const dues = useUnpaidDues();
  const students = useStudents();
  const month = usePaymentsThisMonth();
  const [filter, setFilter] = useState<'all' | 'overdue'>('all');
  const [search, setSearch] = useState('');
  const today = todayYmd();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';

  const groups = useMemo(
    () => groupByStudent(dues.data ?? [], today, (d) => toYmd(d.dueDate.toDate())),
    [dues.data, today],
  );
  const sum = useMemo(() => totals(groups), [groups]);
  const byId = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);

  const shown = groups.filter((g) => {
    if (filter === 'overdue' && !g.overdue) return false;
    const name = byId.get(g.studentId)?.name.toLowerCase() ?? '';
    return !search.trim() || name.includes(search.trim().toLowerCase());
  });

  const refetch = () => {
    void dues.refetch();
    void month.refetch();
  };

  if (dues.isError) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={refetch}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={shown}
        keyExtractor={(g) => g.studentId}
        refreshControl={<RefreshControl refreshing={dues.isRefetching} onRefresh={refetch} />}
        ItemSeparatorComponent={() => (
          <View style={{ height: 1, backgroundColor: colors.border }} />
        )}
        ListHeaderComponent={
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Text style={type.title}>{t('tabs.fees')}</Text>
            {dues.isLoading ? (
              <Skeleton height={96} />
            ) : (
              <View style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Card style={{ flex: 1, gap: 2 }}>
                    <Text style={type.caption}>{t('fees.pending')}</Text>
                    <Text style={[type.heading, { fontSize: 20 }]}>
                      {formatINR(sum.outstanding)}
                    </Text>
                    <Text style={type.caption}>
                      {t('fees.studentsCount', { count: sum.students })}
                    </Text>
                  </Card>
                  <Card
                    style={{
                      flex: 1,
                      gap: 2,
                      borderColor: sum.overdueAmount ? colors.danger : colors.border,
                    }}
                  >
                    <Text style={type.caption}>{t('fees.overdue')}</Text>
                    <Text
                      style={[
                        type.heading,
                        { fontSize: 20, color: sum.overdueAmount ? colors.danger : colors.text },
                      ]}
                    >
                      {formatINR(sum.overdueAmount)}
                    </Text>
                    <Text style={type.caption}>
                      {t('fees.studentsCount', { count: sum.overdueStudents })}
                    </Text>
                  </Card>
                </View>
                <Card style={{ gap: 2 }}>
                  <Text style={type.caption}>{t('fees.collectedMonth')}</Text>
                  <Text style={[type.heading, { fontSize: 20, color: colors.success }]}>
                    {formatINR(netCollected(month.data ?? []))}
                  </Text>
                </Card>
              </View>
            )}
            <Input
              label={t('students.search')}
              value={search}
              onChangeText={setSearch}
              placeholder={t('students.searchHint')}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Chip
                label={t('fees.allPending')}
                selected={filter === 'all'}
                onPress={() => setFilter('all')}
              />
              <Chip
                label={t('fees.overdue')}
                selected={filter === 'overdue'}
                tone="danger"
                onPress={() => setFilter('overdue')}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          dues.isLoading ? null : (
            <EmptyState
              icon="checkmark-circle-outline"
              title={t('fees.allClear')}
              message={t('fees.allClearHint')}
            />
          )
        }
        renderItem={({ item }) => {
          const s = byId.get(item.studentId);
          return (
            <ListItem
              title={s?.name ?? '—'}
              subtitle={`${item.overdue ? t('fees.overdueSince') : t('fees.dueOn')} ${prettyDate(item.oldestDueDate, locale)}`}
              left={<Avatar name={s?.name ?? '?'} uri={s?.photoUrl} />}
              right={
                <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                  <Text style={[type.label, { color: item.overdue ? colors.danger : colors.text }]}>
                    {formatINR(item.outstanding)}
                  </Text>
                  <Button
                    variant="ghost"
                    title={t('fees.remind')}
                    onPress={() => nav.navigate('Reminder', { studentId: item.studentId })}
                  />
                </View>
              }
              onPress={() =>
                item.dueIds.length === 1
                  ? nav.navigate('CollectFee', { dueId: item.dueIds[0] })
                  : nav.navigate('FeeLedger', { studentId: item.studentId })
              }
            />
          );
        }}
      />
    </Screen>
  );
}
