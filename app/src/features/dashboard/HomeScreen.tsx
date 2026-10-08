import { ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
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
  useBatches,
  useStudents,
  useUnpaidDues,
  usePaymentsThisMonth,
} from '../../data/hooks';
import { todayYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { scheduleLabel } from '../batches/format';
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
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 2 }}>
      <Text style={type.caption}>{label}</Text>
      <Text style={[type.heading, { fontSize: 22, color: tone ?? colors.text }]}>{value}</Text>
      {sub ? <Text style={type.caption}>{sub}</Text> : null}
    </Card>
  );
}

export function HomeScreen() {
  const { t } = useTranslation();
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

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <View>
          <Text style={type.title}>{t('home.hello', { name: name ?? '' })}</Text>
          <Text style={type.caption}>{t('home.subtitle')}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Button
            title={t('home.addStudent')}
            onPress={() => {
              if (guard.check('student')) nav.navigate('StudentForm');
            }}
          />
          <Button
            variant="secondary"
            title={t('home.markAttendance')}
            onPress={() => nav.navigate('Attendance')}
          />
          <Button
            variant="secondary"
            title={t('home.collectFee')}
            onPress={() => nav.navigate('Fees')}
          />
        </View>

        {loading ? (
          <View style={{ gap: spacing.sm }}>
            <Skeleton height={80} />
            <Skeleton height={80} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Stat label={t('home.students')} value={String(s.activeStudents)} />
            <Stat
              label={t('home.presentToday')}
              value={s.markedToday ? `${s.presentToday}/${s.markedToday}` : '—'}
              sub={s.markedToday ? undefined : t('home.notMarkedYet')}
              tone={colors.success}
            />
            <Stat
              label={t('home.pendingFees')}
              value={formatINR(s.pendingAmount)}
              sub={t('fees.studentsCount', { count: s.pendingStudents })}
              tone={s.pendingAmount ? colors.warning : colors.text}
            />
            <Stat label={t('home.batches')} value={String(s.activeBatches)} />
            <Stat
              label={t('home.collectedToday')}
              value={formatINR(s.collectedToday)}
              tone={colors.success}
            />
            <Stat
              label={t('home.collectedMonth')}
              value={formatINR(s.collectedMonth)}
              tone={colors.success}
            />
          </View>
        )}

        <Text style={type.heading}>{t('home.todaysBatches')}</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 12, overflow: 'hidden' }}>
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
