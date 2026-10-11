import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Kpi } from 'panelui-native/components/kpi';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  TopBar,
} from '../../components';
import { useInstitute, usePaymentsThisMonth, useStudents, useUnpaidDues } from '../../data/hooks';
import { shortDate, todayYmd, toYmd } from '../../lib/dates';
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
          <View
            style={{
              marginHorizontal: spacing.lg,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderLeftWidth: 1,
              borderRightWidth: 1,
            }}
          >
            <InsetSeparator />
          </View>
        )}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        ListHeaderComponent={
          <View style={{ padding: spacing.lg, gap: spacing.md }}>
            <TopBar title={t('tabs.fees')} />
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
              <Card style={{ padding: spacing.lg }}>
                <Kpi.Group>
                  <Kpi surface={false}>
                    <Kpi.Header>
                      <Kpi.Title>{t('fees.pending')}</Kpi.Title>
                    </Kpi.Header>
                    <Kpi.Content>
                      <Kpi.Value className="text-xl">{formatINR(sum.outstanding)}</Kpi.Value>
                    </Kpi.Content>
                    <Text style={type.caption2}>
                      {t('fees.studentsCount', { count: sum.students })}
                    </Text>
                  </Kpi>
                  <Kpi surface={false}>
                    <Kpi.Header>
                      <Kpi.Title>{t('fees.overdue')}</Kpi.Title>
                    </Kpi.Header>
                    <Kpi.Content>
                      <Kpi.Value
                        className={sum.overdueAmount ? 'text-xl text-destructive' : 'text-xl'}
                      >
                        {formatINR(sum.overdueAmount)}
                      </Kpi.Value>
                    </Kpi.Content>
                    <Text style={type.caption2}>
                      {t('fees.studentsCount', { count: sum.overdueStudents })}
                    </Text>
                  </Kpi>
                  <Kpi surface={false}>
                    <Kpi.Header>
                      <Kpi.Title>{t('fees.collectedShort')}</Kpi.Title>
                    </Kpi.Header>
                    <Kpi.Content>
                      <Kpi.Value className="text-xl text-success">
                        {formatINR(netCollected(month.data ?? []))}
                      </Kpi.Value>
                    </Kpi.Content>
                    <Text style={type.caption2}>{t('fees.collectedThisMonth')}</Text>
                  </Kpi>
                </Kpi.Group>
              </Card>
            )}
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
            {/* labelled, so the sort order is not mistaken for another filter */}
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: spacing.xs,
              }}
              accessibilityRole="radiogroup"
              accessibilityLabel={t('fees.sortBy')}
            >
              <Text style={[type.caption, { marginRight: 2 }]}>{t('fees.sortBy')}</Text>
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
        // Chasing dues comes first; the history is background, so it sits after the list.
        ListFooterComponent={
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.xl }}>
            <FeesHistoryCard />
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
                // the rows together read as one bordered card, like the Students list
                borderColor: colors.border,
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderTopWidth: first ? 1 : 0,
                borderBottomWidth: last ? 1 : 0,
              }}
            >
              <ListItem
                title={s?.name ?? '—'}
                subtitle={`${item.overdue ? t('fees.overdueSince') : t('fees.dueOn')} ${shortDate(item.oldestDueDate, locale)}`}
                left={<Avatar name={s?.name ?? '?'} uri={s?.photoUrl} />}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text
                      style={[
                        type.label,
                        { fontSize: 16, color: item.overdue ? colors.danger : colors.text },
                      ]}
                    >
                      {formatINR(item.outstanding)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  </View>
                }
                // One place for a student's money: collect, remind, advance and fee plan are on the ledger.
                onPress={() => nav.navigate('FeeLedger', { studentId: item.studentId })}
              />
            </View>
          );
        }}
      />
    </Screen>
  );
}
