import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Table } from 'panelui-native/components/table';
import { Button, Chip, EmptyState, Panel, Skeleton } from '../components';
import {
  useAttendanceOn,
  useAttendanceRange,
  useBatches,
  usePaymentsThisMonth,
  useStudents,
  useUnpaidDues,
} from '../data/hooks';
import { addDays, prettyDate, shortDate, todayYmd, toYmd } from '../lib/dates';
import { formatINR } from '../lib/money';
import type { MainStackParams } from '../navigation/types';
import { colors, spacing, type } from '../theme';
import { useSession } from '../features/auth/session';
import { AnnouncementBanner } from '../features/announcements/AnnouncementBanner';
import { DiwaliCard } from '../features/diwali/DiwaliCard';
import { timeRange } from '../features/batches/format';
import { PlanBanner } from '../features/billing/PlanBanner';
import { AttendanceRing } from '../features/dashboard/AttendanceRing';
import { greetingKey } from '../features/dashboard/greeting';
import { dashboardStats, weekAttendance } from '../features/dashboard/logic';
import { WeekChart } from '../features/dashboard/WeekChart';
import { PaymentReportsCard } from '../features/fees/PaymentReportsCard';
import { EnquiriesDueCard } from '../features/enquiries/EnquiriesDueCard';
import { groupByStudent } from '../features/fees/logic';
import { GettingStartedCard } from '../features/onboarding/GettingStartedCard';
import { OwnerDetailsCard } from '../features/onboarding/OwnerDetailsCard';
import { WelcomeTour } from '../features/onboarding/WelcomeTour';
import { TasksCard } from '../features/tasks/TasksCard';
import { CellLink, DesktopPage, LinkButton, Split, StatCard, StatGrid } from './parts';
import { presentTone } from '../features/attendance/logic';

/** How many students the "Fees to collect" panel lists before "View all". */
const FEES_SHOWN = 6;

/**
 * Home on a laptop or desktop: the month's numbers in a row, today's classes and the fees to chase as tables, and
 * today's attendance, the week and the to-do list beside them.
 */
export function DesktopHome() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const name = useSession((s) => s.profile?.name);
  const today = todayYmd();
  const students = useStudents();
  const batches = useBatches();
  const attendance = useAttendanceOn(today);
  const week = useAttendanceRange(addDays(today, -6), today);
  const unpaid = useUnpaidDues();
  const month = usePaymentsThisMonth();

  const loading =
    students.isLoading ||
    batches.isLoading ||
    attendance.isLoading ||
    unpaid.isLoading ||
    month.isLoading;
  // only a list that never loaded is a failure: a background refresh that fails keeps the numbers already shown
  const failed = [students, batches, attendance, unpaid, month].some((q) => q.isError && !q.data);

  const s = dashboardStats({
    students: students.data ?? [],
    batches: batches.data ?? [],
    attendanceToday: attendance.data ?? [],
    unpaid: unpaid.data ?? [],
    paymentsMonth: month.data ?? [],
    today,
  });
  const byId = useMemo(() => new Map((students.data ?? []).map((x) => [x.id, x])), [students.data]);
  const owing = useMemo(
    () =>
      groupByStudent(unpaid.data ?? [], today, (d) => toYmd(d.dueDate.toDate())).sort(
        (a, b) => Number(b.overdue) - Number(a.overdue) || b.outstanding - a.outstanding,
      ),
    [unpaid.data, today],
  );
  const toMark = s.todaysBatches.filter((b) => b.status === 'notMarked').length;
  const collectedShare =
    s.collectedMonth + s.pendingAmount > 0
      ? s.collectedMonth / (s.collectedMonth + s.pendingAmount)
      : null;
  const firstName = (name ?? '').split(' ')[0];
  const goTab = (screen: 'Fees' | 'Students' | 'Attendance') =>
    (nav.navigate as unknown as (n: string) => void)(screen);

  if (failed) {
    return (
      <DesktopPage title={t('tabs.home')}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void students.refetch();
            void batches.refetch();
            void attendance.refetch();
            void unpaid.refetch();
            void month.refetch();
          }}
        />
      </DesktopPage>
    );
  }

  return (
    <DesktopPage
      eyebrow={prettyDate(today, 'en-IN')}
      title={t(`home.greeting.${greetingKey()}`, { name: firstName })}
      subtitle={t('desktop.home.subtitle')}
    >
      <WelcomeTour />
      <DiwaliCard />
      <AnnouncementBanner />
      <PlanBanner />
      <PaymentReportsCard />
      <EnquiriesDueCard />

      {loading ? (
        <Skeleton height={132} />
      ) : (
        <StatGrid>
          <StatCard
            label={t('home.collectedMonth')}
            value={formatINR(s.collectedMonth)}
            icon="trending-up"
            tone="success"
            progress={collectedShare}
            sub={
              collectedShare === null
                ? t('home.todayAmount', { amount: formatINR(s.collectedToday) })
                : `${t('home.collectedShare', { percent: Math.round(collectedShare * 100) })} · ${t('home.todayAmount', { amount: formatINR(s.collectedToday) })}`
            }
            onPress={() => nav.navigate('Reports')}
          />
          <StatCard
            label={t('home.pendingShort')}
            value={formatINR(s.pendingAmount)}
            icon="time-outline"
            tone="warning"
            sub={t('desktop.home.studentsOwe', { count: owing.length })}
            onPress={() => goTab('Fees')}
          />
          <StatCard
            label={t('home.overdue')}
            value={formatINR(s.overdueAmount)}
            icon="alert-circle-outline"
            tone="danger"
            valueTone={s.overdueAmount > 0 ? 'danger' : 'neutral'}
            sub={t('desktop.home.studentsOverdue', {
              count: owing.filter((g) => g.overdue).length,
            })}
            onPress={() => goTab('Fees')}
          />
          <StatCard
            label={t('home.students')}
            value={String(s.activeStudents)}
            icon="people-outline"
            tone="info"
            sub={t('desktop.home.inBatches', { count: s.activeBatches })}
            onPress={() => goTab('Students')}
          />
        </StatGrid>
      )}

      <Split
        main={
          <>
            <Panel
              title={t('desktop.home.todaysClasses')}
              right={
                <LinkButton label={t('tabs.attendance')} onPress={() => goTab('Attendance')} />
              }
              padded={false}
            >
              {loading ? (
                <View style={{ padding: spacing.lg }}>
                  <Skeleton height={120} />
                </View>
              ) : s.todaysBatches.length ? (
                <Table
                  columns={[
                    { flex: 2 },
                    { flex: 1.6 },
                    { flex: 0.8 },
                    { flex: 1.3 },
                    { width: 120, align: 'end' },
                  ]}
                >
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>{t('desktop.col.batch')}</Table.Head>
                      <Table.Head>{t('desktop.col.time')}</Table.Head>
                      <Table.Head>{t('desktop.col.students')}</Table.Head>
                      <Table.Head>{t('desktop.col.status')}</Table.Head>
                      <Table.Head> </Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {s.todaysBatches.map((tb) => (
                      <Table.Row key={tb.batch.id}>
                        <Table.Cell>
                          <CellLink
                            label={tb.batch.name}
                            onPress={() =>
                              nav.navigate('MarkAttendance', { batchId: tb.batch.id, date: today })
                            }
                          />
                        </Table.Cell>
                        <Table.Cell>{timeRange(tb.batch.startTime, tb.batch.endTime)}</Table.Cell>
                        <Table.Cell>{String(tb.batch.studentCount)}</Table.Cell>
                        <Table.Cell>
                          {tb.status === 'marked' ? (
                            <Chip
                              small
                              tone={presentTone(tb.present, tb.total)}
                              label={t('attendance.presentOf', {
                                present: tb.present,
                                total: tb.total,
                              })}
                            />
                          ) : tb.status === 'notMarked' ? (
                            <Chip small tone="warning" label={t('attendance.notMarked')} />
                          ) : (
                            <Chip
                              small
                              label={t(
                                tb.status === 'cancelled'
                                  ? 'attendance.cancelled'
                                  : 'attendance.holiday',
                              )}
                            />
                          )}
                        </Table.Cell>
                        <Table.Cell>
                          <Button
                            size="small"
                            variant={tb.status === 'notMarked' ? 'primary' : 'outline'}
                            title={t(tb.status === 'notMarked' ? 'desktop.mark' : 'desktop.view')}
                            onPress={() =>
                              nav.navigate('MarkAttendance', { batchId: tb.batch.id, date: today })
                            }
                          />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              ) : (
                <Text style={[type.subhead, { color: colors.textMuted, padding: spacing.lg }]}>
                  {t('home.noClassesToday')}
                </Text>
              )}
            </Panel>

            <Panel
              title={t('desktop.home.feesToCollect')}
              right={
                owing.length > FEES_SHOWN ? (
                  <LinkButton
                    label={t('desktop.viewAll', { count: owing.length })}
                    onPress={() => goTab('Fees')}
                  />
                ) : undefined
              }
              padded={false}
            >
              {loading ? (
                <View style={{ padding: spacing.lg }}>
                  <Skeleton height={120} />
                </View>
              ) : owing.length ? (
                <Table
                  columns={[
                    { flex: 2.2 },
                    { flex: 1.4 },
                    { flex: 1, align: 'end' },
                    { width: 190, align: 'end' },
                  ]}
                >
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>{t('desktop.col.student')}</Table.Head>
                      <Table.Head>{t('desktop.col.due')}</Table.Head>
                      <Table.Head>{t('desktop.col.outstanding')}</Table.Head>
                      <Table.Head> </Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {owing.slice(0, FEES_SHOWN).map((g) => {
                      const st = byId.get(g.studentId);
                      return (
                        <Table.Row key={g.studentId}>
                          <Table.Cell>
                            <CellLink
                              label={st?.name ?? '—'}
                              avatar={{ name: st?.name ?? '?', uri: st?.photoUrl }}
                              onPress={() => nav.navigate('FeeLedger', { studentId: g.studentId })}
                            />
                          </Table.Cell>
                          <Table.Cell>
                            <Text
                              style={[
                                type.footnote,
                                { color: g.overdue ? colors.danger : colors.textMuted },
                              ]}
                            >
                              {`${g.overdue ? t('fees.overdueSince') : t('fees.dueOn')} ${shortDate(g.oldestDueDate)}`}
                            </Text>
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
              ) : (
                <Text style={[type.subhead, { color: colors.textMuted, padding: spacing.lg }]}>
                  {t('fees.allClear')}
                </Text>
              )}
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={t('home.heroTitle')}>
              {loading ? (
                <Skeleton height={84} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
                  {s.todaysBatches.length ? (
                    <AttendanceRing present={s.presentToday} total={s.markedToday} size={84} />
                  ) : null}
                  <Text style={[type.subhead, { flex: 1, color: colors.textMuted }]}>
                    {s.markedToday
                      ? t(toMark ? 'home.toMark' : 'home.allMarked', { count: toMark })
                      : s.todaysBatches.length
                        ? t('home.notMarkedYet')
                        : t('home.noClassesToday')}
                  </Text>
                </View>
              )}
            </Panel>
            {week.data?.length ? (
              <WeekChart points={weekAttendance(week.data, today, addDays)} today={today} />
            ) : null}
            <OwnerDetailsCard />
            <GettingStartedCard hasAttendance={(week.data?.length ?? 0) > 0} />
            <TasksCard date={today} />
          </>
        }
      />
    </DesktopPage>
  );
}
