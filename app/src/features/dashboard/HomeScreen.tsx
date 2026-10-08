import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
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
  useBatches,
  usePaymentsThisMonth,
  useStudents,
  useUnpaidDues,
} from '../../data/hooks';
import { prettyDate, todayYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, shadow, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { scheduleLabel } from '../batches/format';
import { AttendanceRing } from './AttendanceRing';
import { dashboardStats } from './logic';

type Nav = NativeStackNavigationProp<MainStackParams & { Attendance: undefined; Fees: undefined }>;

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 2, paddingVertical: 14 }}>
      <Text style={type.caption}>{label}</Text>
      <Text
        style={[
          type.heading,
          {
            fontSize: 24,
            lineHeight: 30,
            letterSpacing: -0.5,
            fontWeight: '700',
            color: tone ?? colors.text,
          },
        ]}
      >
        {value}
      </Text>
      {sub ? <Text style={[type.caption, { fontSize: 12 }]}>{sub}</Text> : null}
    </Card>
  );
}

function Action({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone: { bg: string; fg: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: spacing.sm,
        paddingTop: 14,
        paddingBottom: 12,
        borderRadius: radius.lg - 2,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.85 : 1,
        ...shadow.card,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone.bg,
        }}
      >
        <Ionicons name={icon} size={22} color={tone.fg} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function HomeScreen() {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<Nav>();
  const name = useSession((s) => s.profile?.name);
  const today = todayYmd();
  const students = useStudents();
  const batches = useBatches();
  const attendance = useAttendanceOn(today);
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

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.caption, { fontWeight: '500' }]}>
              {prettyDate(today, i18n.language === 'hi' ? 'hi-IN' : 'en-IN')}
            </Text>
            <Text style={type.title} numberOfLines={1}>
              {t('home.hello', { name: (name ?? '').split(' ')[0] })}
            </Text>
          </View>
          <Avatar name={name ?? '?'} size={40} />
        </View>

        {loading ? (
          <Skeleton height={130} />
        ) : (
          <Card
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.lg,
              padding: 18,
              borderRadius: radius.xl,
              ...shadow.raised,
            }}
          >
            <AttendanceRing present={s.presentToday} total={s.markedToday} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={type.heading}>{t('home.heroTitle')}</Text>
              <Text style={[type.caption, { fontSize: 14, lineHeight: 19 }]}>
                {s.markedToday
                  ? t(toMark ? 'home.toMark' : 'home.allMarked', { count: toMark })
                  : t('home.notMarkedYet')}
              </Text>
              {toMark > 0 && s.markedToday > 0 ? (
                <Chip label={t('home.toMark', { count: toMark })} tone="warning" />
              ) : null}
            </View>
          </Card>
        )}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Action
            icon="add"
            label={t('home.addStudent')}
            tone={{ bg: colors.primarySoft, fg: colors.primary }}
            onPress={() => {
              if (guard.check('student')) nav.navigate('StudentForm');
            }}
          />
          <Action
            icon="calendar-outline"
            label={t('home.markAttendance')}
            tone={{ bg: colors.successSoft, fg: colors.success }}
            onPress={() => nav.navigate('Attendance')}
          />
          <Action
            icon="cash-outline"
            label={t('home.collectFee')}
            tone={{ bg: colors.warningSoft, fg: colors.warning }}
            onPress={() => nav.navigate('Fees')}
          />
        </View>

        {loading ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={84} />
            <Skeleton height={84} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stat
              label={t('home.pendingFees')}
              value={formatINR(s.pendingAmount)}
              sub={t('fees.studentsCount', { count: s.pendingStudents })}
              tone={s.pendingAmount ? colors.warning : colors.text}
            />
            <Stat
              label={t('home.collectedMonth')}
              value={formatINR(s.collectedMonth)}
              sub={t('home.todayAmount', { amount: formatINR(s.collectedToday) })}
              tone={colors.success}
            />
            <Stat
              label={t('home.students')}
              value={String(s.activeStudents)}
              sub={t('home.acrossBatches', { count: s.activeBatches })}
            />
            <Stat
              label={t('home.overdue')}
              value={formatINR(s.overdueAmount)}
              sub={t('fees.studentsCount', { count: s.overdueStudents })}
              tone={s.overdueAmount ? colors.danger : colors.text}
            />
          </View>
        )}

        <Text style={[type.heading, { fontSize: 20, marginTop: spacing.xs, paddingHorizontal: 4 }]}>
          {t('home.todaysBatches')}
        </Text>
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            overflow: 'hidden',
            ...shadow.card,
          }}
        >
          {!loading && s.todaysBatches.length === 0 ? (
            <EmptyState icon="calendar-outline" title={t('home.noClassesToday')} />
          ) : null}
          {s.todaysBatches.map((tb) => (
            <ListItem
              key={tb.batch.id}
              title={tb.batch.name}
              subtitle={scheduleLabel(tb.batch, t)}
              right={
                tb.status === 'marked' ? (
                  <Chip
                    label={t('attendance.presentOf', { present: tb.present, total: tb.total })}
                    tone="success"
                  />
                ) : tb.status === 'notMarked' ? (
                  <Chip label={t('attendance.notMarked')} tone="warning" />
                ) : (
                  <Chip
                    label={t(
                      tb.status === 'cancelled' ? 'attendance.cancelled' : 'attendance.holiday',
                    )}
                  />
                )
              }
              onPress={() => nav.navigate('MarkAttendance', { batchId: tb.batch.id, date: today })}
            />
          ))}
        </View>
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
