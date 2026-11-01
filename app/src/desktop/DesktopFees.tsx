import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Table, type TableSortDirection } from 'panelui-native/components/table';
import { Button, Chip, EmptyState, SearchField, Segmented, Skeleton } from '../components';
import { useInstitute, usePaymentsThisMonth, useStudents, useUnpaidDues } from '../data/hooks';
import { shortDate, todayYmd, toYmd } from '../lib/dates';
import { formatINR } from '../lib/money';
import type { MainStackParams } from '../navigation/types';
import { colors, spacing, type } from '../theme';
import { FeesHistoryCard } from '../features/fees/FeesHistoryCard';
import { groupByStudent, netCollected, totals, type StudentDues } from '../features/fees/logic';
import { card, CellLink, DesktopPage, Split, StatCard, StatGrid } from './parts';

type SortKey = 'name' | 'due' | 'amount';

/** Fees on a laptop or desktop: the totals in a row, everyone who owes in a sortable table, the history beside it. */
export function DesktopFees() {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const dues = useUnpaidDues();
  const students = useStudents();
  const month = usePaymentsThisMonth();
  const institute = useInstitute();
  const noWayToPay = !!institute.data && !institute.data.upiId && !institute.data.paymentLink;
  const [filter, setFilter] = useState<'all' | 'overdue'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: TableSortDirection }>({
    key: 'due',
    dir: 'asc',
  });
  const today = todayYmd();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';

  const groups = useMemo(
    () => groupByStudent(dues.data ?? [], today, (d) => toYmd(d.dueDate.toDate())),
    [dues.data, today],
  );
  const sum = useMemo(() => totals(groups), [groups]);
  const byId = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const nameOf = (sid: string) => byId.get(sid)?.name ?? '';

  const compare: Record<SortKey, (a: StudentDues, b: StudentDues) => number> = {
    name: (a, b) => nameOf(a.studentId).localeCompare(nameOf(b.studentId)),
    due: (a, b) => a.oldestDueDate.localeCompare(b.oldestDueDate),
    amount: (a, b) => a.outstanding - b.outstanding,
  };
  const q = search.trim().toLowerCase();
  const shown = groups
    .filter(
      (g) =>
        (filter === 'all' || g.overdue) && (!q || nameOf(g.studentId).toLowerCase().includes(q)),
    )
    .sort((a, b) => (sort.dir === 'asc' ? compare[sort.key](a, b) : compare[sort.key](b, a)));

  const head = (key: SortKey) => ({
    sortable: true,
    sortDirection: sort.key === key ? sort.dir : undefined,
    onPress: () =>
      setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' })),
  });

  return (
    <DesktopPage
      title={t('tabs.fees')}
      subtitle={t('desktop.fees.subtitle')}
      actions={
        <>
          <Button
            size="small"
            variant="outline"
            title={t('settings.paymentsTitle')}
            icon={<Ionicons name="qr-code-outline" size={16} color={colors.text} />}
            onPress={() => nav.navigate('PaymentSettings')}
          />
          <Button
            size="small"
            variant="outline"
            title={t('reports.title')}
            icon={<Ionicons name="bar-chart-outline" size={16} color={colors.text} />}
            onPress={() => nav.navigate('Reports')}
          />
        </>
      }
    >
      {noWayToPay ? (
        <View
          style={[
            card,
            {
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              padding: spacing.lg,
              borderLeftWidth: 4,
              borderLeftColor: colors.danger,
            },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={type.heading}>{t('fees.noUpiTitle')}</Text>
            <Text style={type.caption}>{t('fees.noUpiText')}</Text>
          </View>
          <Button
            size="small"
            variant="danger"
            title={t('fees.noUpiAction')}
            onPress={() => nav.navigate('PaymentSettings')}
          />
        </View>
      ) : null}

      {dues.isLoading ? (
        <Skeleton height={120} />
      ) : (
        <StatGrid>
          <StatCard
            label={t('fees.pending')}
            value={formatINR(sum.outstanding)}
            icon="time-outline"
            tone="warning"
            sub={t('desktop.home.studentsOwe', { count: sum.students })}
          />
          <StatCard
            label={t('fees.overdue')}
            value={formatINR(sum.overdueAmount)}
            icon="alert-circle-outline"
            tone="danger"
            valueTone={sum.overdueAmount ? 'danger' : 'neutral'}
            sub={t('desktop.home.studentsOverdue', { count: sum.overdueStudents })}
            onPress={() => setFilter('overdue')}
          />
          <StatCard
            label={t('home.collectedMonth')}
            value={formatINR(netCollected(month.data ?? []))}
            icon="checkmark-done-outline"
            tone="success"
            valueTone="success"
            sub={t('desktop.fees.payments', {
              count: (month.data ?? []).filter((p) => p.amount > 0).length,
            })}
          />
        </StatGrid>
      )}

      <Split
        stackBelow={1180}
        main={
          <View style={{ gap: spacing.md }}>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: spacing.md,
              }}
            >
              <View style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
                <SearchField
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('desktop.fees.search')}
                />
              </View>
              <View style={{ width: 240 }}>
                <Segmented
                  options={[
                    { value: 'all', label: t('fees.allPending') },
                    { value: 'overdue', label: t('fees.overdue') },
                  ]}
                  value={filter}
                  onChange={setFilter}
                />
              </View>
            </View>
            {dues.isError ? (
              <EmptyState
                icon="alert-circle-outline"
                title={t('common.error')}
                actionLabel={t('common.retry')}
                onAction={() => void dues.refetch()}
              />
            ) : dues.isLoading ? (
              <Skeleton height={280} />
            ) : groups.length === 0 ? (
              <View style={[card, { padding: spacing.xl }]}>
                <EmptyState
                  icon="checkmark-circle-outline"
                  title={t('fees.allClear')}
                  message={t('fees.allClearHint')}
                />
              </View>
            ) : (
              <View style={[card, { overflow: 'hidden' }]}>
                <Table
                  columns={[
                    { flex: 2.2 },
                    { flex: 1.6 },
                    { flex: 1.1, align: 'end' },
                    { width: 196, align: 'end' },
                  ]}
                >
                  <Table.Header>
                    <Table.Row>
                      <Table.Head {...head('name')}>{t('desktop.col.student')}</Table.Head>
                      <Table.Head {...head('due')}>{t('desktop.col.due')}</Table.Head>
                      <Table.Head {...head('amount')}>{t('desktop.col.outstanding')}</Table.Head>
                      <Table.Head> </Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {shown.map((g) => {
                      const s = byId.get(g.studentId);
                      return (
                        <Table.Row key={g.studentId}>
                          <Table.Cell>
                            <CellLink
                              label={s?.name ?? '—'}
                              avatar={{ name: s?.name ?? '?', uri: s?.photoUrl }}
                              onPress={() => nav.navigate('FeeLedger', { studentId: g.studentId })}
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: spacing.sm,
                              }}
                            >
                              <Chip
                                small
                                tone={g.overdue ? 'danger' : 'warning'}
                                label={g.overdue ? t('fees.overdue') : t('fees.dueOn')}
                              />
                              <Text style={type.footnote}>
                                {shortDate(g.oldestDueDate, locale)}
                              </Text>
                            </View>
                          </Table.Cell>
                          <Table.Cell
                            labelClassName={
                              g.overdue ? 'font-semibold text-destructive' : 'font-semibold'
                            }
                          >
                            {formatINR(g.outstanding)}
                          </Table.Cell>
                          <Table.Cell>
                            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                              <Button
                                size="small"
                                variant="outline"
                                title={t('fees.remind')}
                                onPress={() => nav.navigate('Reminder', { studentId: g.studentId })}
                              />
                              <Button
                                size="small"
                                title={t('desktop.collect')}
                                onPress={() =>
                                  nav.navigate('FeeLedger', { studentId: g.studentId })
                                }
                              />
                            </View>
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table>
                {shown.length === 0 ? (
                  <Text style={[type.subhead, { color: colors.textMuted, padding: spacing.xl }]}>
                    {t('students.noMatch')}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        }
        side={<FeesHistoryCard />}
      />
    </DesktopPage>
  );
}
