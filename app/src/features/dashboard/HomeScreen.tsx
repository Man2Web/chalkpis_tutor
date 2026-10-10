import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ListItem,
  Screen,
  Skeleton,
  UpgradePrompt,
} from '../../components';
import { useAddGuard } from '../../data/guards';
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
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { scheduleLabel } from '../batches/format';
import { PlanBanner } from '../billing/PlanBanner';
import { AnnouncementBanner } from '../announcements/AnnouncementBanner';
import { AttendanceRing } from './AttendanceRing';
import { HomeHero } from './HomeHero';
import { greetingKey, HomeHeader } from './HomeHeader';
import { haptic } from '../../lib/haptics';
import { TasksCard } from '../tasks/TasksCard';
import { dashboardStats, weekAttendance } from './logic';
import { WeekChart } from './WeekChart';

type Nav = NativeStackNavigationProp<
  MainStackParams & { Attendance: undefined; Fees: undefined; More: undefined }
>;

/** A round quick-action button with a label, like the shortcuts row in iOS apps. */
function Action({
  icon,
  label,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 6,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color,
        }}
      >
        <Ionicons name={icon} size={24} color="#FFFFFF" />
      </View>
      <Text
        style={{ fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Small grey uppercase heading above a group, as in iOS. */
const SectionTitle = ({ children }: { children: string }) => (
  <Text style={[type.sectionHeader, { marginLeft: spacing.xs, marginTop: spacing.sm }]}>
    {children}
  </Text>
);

export function HomeScreen() {
  const { t } = useTranslation();
  const nav = useNavigation<Nav>();
  const name = useSession((s) => s.profile?.name);
  const today = todayYmd();
  const students = useStudents();
  const batches = useBatches();
  const attendance = useAttendanceOn(today);
  const week = useAttendanceRange(addDays(today, -6), today);
  const unpaid = useUnpaidDues();
  const month = usePaymentsThisMonth();
  const guard = useAddGuard();

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
        <HomeHeader name={name ?? ''} onProfile={() => nav.navigate('More')} />

        <View style={{ gap: 2, marginBottom: spacing.xs }}>
          <Text style={type.footnote}>{prettyDate(today, 'en-IN')}</Text>
          <Text style={type.title1} numberOfLines={1}>
            {t(`home.greeting.${greetingKey()}`, { name: firstName })}
          </Text>
        </View>

        <AnnouncementBanner />
        <PlanBanner />

        {!loading && s.activeStudents === 0 ? (
          <Card style={{ gap: spacing.sm }}>
            <Text style={type.title3}>{t('home.firstRunTitle')}</Text>
            <Text style={[type.subhead, { color: colors.textMuted }]}>
              {t('home.firstRunText')}
            </Text>
            <Button
              title={t('home.firstRunAction')}
              onPress={() => {
                if (guard.check('student')) nav.navigate('StudentForm');
              }}
            />
          </Card>
        ) : null}

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
              { label: t('home.pendingFees'), value: formatINR(s.pendingAmount) },
              { label: t('home.overdue'), value: formatINR(s.overdueAmount) },
              { label: t('home.students'), value: String(s.activeStudents) },
            ]}
          />
        )}

        <Card
          style={{
            flexDirection: 'row',
            paddingVertical: spacing.lg,
            paddingHorizontal: spacing.sm,
          }}
        >
          <Action
            icon="person-add"
            label={t('home.addStudent')}
            color={colors.primary}
            onPress={() => {
              if (guard.check('student')) nav.navigate('StudentForm');
            }}
          />
          <Action
            icon="checkmark-done"
            label={t('home.markAttendance')}
            color={colors.successFill}
            onPress={() => nav.navigate('Attendance')}
          />
          <Action
            icon="wallet"
            label={t('home.collectFee')}
            color={colors.warningFill}
            onPress={() => nav.navigate('Fees')}
          />
          <Action
            icon="image"
            label={t('poster.short')}
            color={colors.pink}
            onPress={() => nav.navigate('Poster')}
          />
        </Card>

        <SectionTitle>{t('home.today')}</SectionTitle>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              padding: spacing.lg,
            }}
          >
            <AttendanceRing present={s.presentToday} total={s.markedToday} />
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
                onPress={() =>
                  nav.navigate('MarkAttendance', { batchId: tb.batch.id, date: today })
                }
              />
            </View>
          ))}
        </Card>

        {week.data ? (
          <WeekChart points={weekAttendance(week.data, today, addDays)} today={today} />
        ) : (
          <Skeleton height={150} />
        )}

        <TasksCard date={today} />
      </ScrollView>
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'student'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </Screen>
  );
}
