import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Card,
  InsetSeparator,
  SearchField,
  Segmented,
  Chip,
  EmptyState,
  ListItem,
  Screen,
  Skeleton,
} from '../../components';
import { useInstitute, usePaymentsThisMonth, useStudents, useUnpaidDues } from '../../data/hooks';
import { prettyDate, todayYmd, toYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, type } from '../../theme';
import { FeesHistoryCard } from './FeesHistoryCard';
import { groupByStudent, netCollected, totals } from './logic';

type Sort = 'unpaid' | 'name' | 'amount';

export function FeesOverviewScreen() {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const dues = useUnpaidDues();
  const students = useStudents();
  const month = usePaymentsThisMonth();
  const institute = useInstitute();
  const noWayToPay = !!institute.data && !institute.data.upiId && !institute.data.paymentLink;
  const [filter, setFilter] = useState<'all' | 'overdue'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('unpaid');
  const today = todayYmd();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';

  const groups = useMemo(
    () => groupByStudent(dues.data ?? [], today, (d) => toYmd(d.dueDate.toDate())),
    [dues.data, today],
  );
  const sum = useMemo(() => totals(groups), [groups]);
  const byId = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);

  const nameOf = (sid: string) => byId.get(sid)?.name ?? '';
  const shown = groups
    .filter((g) => {
      if (filter === 'overdue' && !g.overdue) return false;
      const name = nameOf(g.studentId).toLowerCase();
      return !search.trim() || name.includes(search.trim().toLowerCase());
    })
    .sort((a, b) =>
      sort === 'name'
        ? nameOf(a.studentId).localeCompare(nameOf(b.studentId))
        : sort === 'amount'
          ? b.outstanding - a.outstanding
          : 0,
    );

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
          <View style={{ marginHorizontal: spacing.lg, backgroundColor: colors.surface }}>
            <InsetSeparator />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        ListHeaderComponent={
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <Text style={type.largeTitle}>{t('tabs.fees')}</Text>
            {noWayToPay ? (
              <Card
                style={{
                  gap: spacing.xs,
                  borderLeftWidth: 4,
                  borderLeftColor: colors.danger,
                  borderColor: colors.dangerSoft,
                }}
              >
                <Text style={type.heading}>{t('fees.noUpiTitle')}</Text>
                <Text style={type.caption}>{t('fees.noUpiText')}</Text>
                <Chip
                  small
                  tone="danger"
                  label={t('fees.noUpiAction')}
                  onPress={() => nav.navigate('PaymentSettings')}
                />
              </Card>
            ) : null}
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
            <FeesHistoryCard />
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={t('students.searchHint')}
            />
            <Segmented
              options={[
                { value: 'all', label: t('fees.allPending') },
                { value: 'overdue', label: t('fees.overdue') },
              ]}
              value={filter}
              onChange={setFilter}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {(['unpaid', 'name', 'amount'] as const).map((k) => (
                <Chip
                  key={k}
                  small
                  label={t(`fees.sort.${k}`)}
                  selected={sort === k}
                  onPress={() => setSort(k)}
                />
              ))}
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
        renderItem={({ item, index }) => {
          const s = byId.get(item.studentId);
          const first = index === 0;
          const last = index === shown.length - 1;
          return (
            <View
              style={{
                marginHorizontal: spacing.lg,
                overflow: 'hidden',
                backgroundColor: colors.surface,
                borderTopLeftRadius: first ? radius.lg : 0,
                borderTopRightRadius: first ? radius.lg : 0,
                borderBottomLeftRadius: last ? radius.lg : 0,
                borderBottomRightRadius: last ? radius.lg : 0,
              }}
            >
              <ListItem
                title={s?.name ?? '—'}
                subtitle={`${item.overdue ? t('fees.overdueSince') : t('fees.dueOn')} ${prettyDate(item.oldestDueDate, locale)}`}
                left={<Avatar name={s?.name ?? '?'} uri={s?.photoUrl} />}
                right={
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text
                      style={[
                        type.label,
                        { fontSize: 16, color: item.overdue ? colors.danger : colors.text },
                      ]}
                    >
                      {formatINR(item.outstanding)}
                    </Text>
                    <Chip
                      small
                      tone="accent"
                      label={t('fees.remind')}
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
            </View>
          );
        }}
      />
    </Screen>
  );
}
