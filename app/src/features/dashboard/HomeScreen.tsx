import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Chip, EmptyState, ListItem, Panel, Screen, Skeleton, TopBar } from '../../components';
import {
  useAttendanceOn,
  useAttendanceRange,
  useBatches,
  usePaymentsThisMonth,
  useStudents,
  useUnpaidDues,
} from '../../data/hooks';
import { addDays, prettyDate, todayYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { colors, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { scheduleLabel } from '../batches/format';
import { PlanBanner } from '../billing/PlanBanner';
import { PaymentReportsCard } from '../fees/PaymentReportsCard';
import { GettingStartedCard } from '../onboarding/GettingStartedCard';
import { WelcomeTour } from '../onboarding/WelcomeTour';
import { AnnouncementBanner } from '../announcements/AnnouncementBanner';
import { AttendanceRing } from './AttendanceRing';
import { HomeHero } from './HomeHero';
import { greetingKey } from './greeting';
import { haptic } from '../../lib/haptics';
import { TasksCard } from '../tasks/TasksCard';
import { dashboardStats, weekAttendance } from './logic';
import { WeekChart } from './WeekChart';

export function HomeScreen() {
  const { t } = useTranslation();
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
  const failed =
    students.isError || batches.isError || attendance.isError || unpaid.isError || month.isError;

  const refetchAll = () => {
    void students.refetch();
    void batches.refetch();
    void attendance.refetch();
    void unpaid.refetch();
    void month.refetch();
  };

  if (failed) {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={refetchAll}
        />
      </Screen>
    );
  }

  const s = dashboardStats({
    students: students.data ?? [],
    batches: batches.data ?? [],
    attendanceToday: attendance.data ?? [],
    unpaid: unpaid.data ?? [],
    paymentsMonth: month.data ?? [],
    today,
  });
  const toMark = s.todaysBatches.filter((b) => b.status === 'notMarked').length;

  const collectedShare =
    s.collectedMonth + s.pendingAmount > 0
      ? s.collectedMonth / (s.collectedMonth + s.pendingAmount)
      : null;
  const firstName = (name ?? '').split(' ')[0];

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              haptic.select();
              refetchAll();
              void week.refetch();
            }}
          />
        }
      >
        <WelcomeTour />
        <TopBar />

        <View style={{ gap: 2, marginBottom: spacing.xs }}>
          <Text style={type.footnote}>{prettyDate(today, 'en-IN')}</Text>
          <Text style={type.title1} numberOfLines={1}>
            {t(`home.greeting.${greetingKey()}`, { name: firstName })}
          </Text>
        </View>

        <AnnouncementBanner />
        <PlanBanner />
        <PaymentReportsCard />
        <GettingStartedCard hasAttendance={(week.data?.length ?? 0) > 0} />

        {loading ? (
          <Skeleton height={210} />
        ) : (
          <HomeHero
            label={t('home.collectedMonth')}
            value={formatINR(s.collectedMonth)}
            sub={t('home.todayAmount', { amount: formatINR(s.collectedToday) })}
            progress={collectedShare}
            progressLabel={
              collectedShare === null
                ? undefined
                : t('home.collectedShare', { percent: Math.round(collectedShare * 100) })
            }
            stats={[
              { label: t('home.pendingShort'), value: formatINR(s.pendingAmount), icon: 'time' },
              {
                label: t('home.overdue'),
                value: formatINR(s.overdueAmount),
                icon: 'alert-circle',
                bad: s.overdueAmount > 0,
              },
              { label: t('home.students'), value: String(s.activeStudents), icon: 'people' },
            ]}
          />
        )}

        <Panel title={t('home.today')} padded={false}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              padding: spacing.lg,
            }}
          >
            {/* the ring only means something on a day with classes */}
            {s.todaysBatches.length ? (
              <AttendanceRing present={s.presentToday} total={s.markedToday} />
            ) : null}
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.heading}>{t('home.heroTitle')}</Text>
              <Text style={[type.subhead, { color: colors.textMuted }]}>
                {s.markedToday
                  ? t(toMark ? 'home.toMark' : 'home.allMarked', { count: toMark })
                  : s.todaysBatches.length
                    ? t('home.notMarkedYet')
                    : t('home.noClassesToday')}
              </Text>
            </View>
          </View>
          {s.todaysBatches.map((tb) => (
            <View
              key={tb.batch.id}
              style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}
            >
              <ListItem
                title={tb.batch.name}
                subtitle={scheduleLabel(tb.batch, t)}
                right={
                  tb.status === 'marked' ? (
                    <Chip
                      small
                      label={t('attendance.presentOf', { present: tb.present, total: tb.total })}
                      tone="success"
                    />
                  ) : tb.status === 'notMarked' ? (
                    <Chip small label={t('attendance.notMarked')} tone="warning" />
                  ) : (
                    <Chip
                      small
                      label={t(
                        tb.status === 'cancelled' ? 'attendance.cancelled' : 'attendance.holiday',
                      )}
                    />
                  )
                }
              />
            </View>
          ))}
        </Panel>

        {/* the week chart appears once there is something to chart */}
        {week.data ? (
          week.data.length ? (
            <WeekChart points={weekAttendance(week.data, today, addDays)} today={today} />
          ) : null
        ) : (
          <Skeleton height={150} />
        )}

        <TasksCard date={today} />
      </ScrollView>
    </Screen>
  );
}
