import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Chip, EmptyState, Skeleton } from '../components';
import { useAttendanceOn, useBatches } from '../data/hooks';
import { fullDate, todayYmd, weekdayOf } from '../lib/dates';
import type { AttendanceDoc } from '../lib/types';
import type { MainStackParams } from '../navigation/types';
import { colors, radius, spacing, type } from '../theme';
import { useIsStaff } from '../features/auth/session';
import { DateStrip } from '../features/attendance/DateStrip';
import { counts, presentTone } from '../features/attendance/logic';
import { scheduleLabel } from '../features/batches/format';
import { card, DesktopPage, usePageWidth, type HoverState } from './parts';

const CARD_MIN = 290;

/** Attendance on a laptop or desktop: the day, then every batch as a card with where it stands and one button. */
export function DesktopAttendance() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const staff = useIsStaff();
  const [date, setDate] = useState(todayYmd());
  const batches = useBatches();
  const day = useAttendanceOn(date);
  const pageWidth = usePageWidth();

  const weekday = weekdayOf(date);
  const active = (batches.data ?? [])
    .filter((b) => b.status === 'active')
    .sort((a, b) => Number(b.days.includes(weekday)) - Number(a.days.includes(weekday)));
  const byBatch = new Map((day.data ?? []).map((d) => [d.batchId, d]));
  const marked = active.filter((b) => byBatch.has(b.id)).length;

  const cols = Math.max(1, Math.floor((pageWidth + spacing.lg) / (CARD_MIN + spacing.lg)));
  const cardWidth = (pageWidth - spacing.lg * (cols - 1)) / cols;

  return (
    <DesktopPage
      title={t('tabs.attendance')}
      subtitle={`${fullDate(date)} · ${t('desktop.attendance.marked', { marked, total: active.length })}`}
      actions={
        <Button
          size="small"
          variant="outline"
          title={t('attendance.reports')}
          icon={<Ionicons name="bar-chart-outline" size={16} color={colors.text} />}
          onPress={() => nav.navigate('AttendanceReport')}
        />
      }
    >
      <View style={{ maxWidth: 720 }}>
        <DateStrip date={date} onChange={setDate} />
      </View>

      {batches.isError || day.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => {
            void batches.refetch();
            void day.refetch();
          }}
        />
      ) : batches.isLoading || day.isLoading ? (
        <Skeleton height={180} />
      ) : active.length === 0 ? (
        <View style={[card, { padding: spacing.xl }]}>
          {staff ? (
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
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg }}>
          {active.map((b) => (
            <BatchCard
              key={b.id}
              width={cardWidth}
              name={b.name}
              schedule={scheduleLabel(b, t)}
              students={b.studentCount}
              meetsToday={b.days.includes(weekday)}
              doc={byBatch.get(b.id)}
              onPress={() => nav.navigate('MarkAttendance', { batchId: b.id, date })}
            />
          ))}
        </View>
      )}
    </DesktopPage>
  );
}

function BatchCard({
  width,
  name,
  schedule,
  students,
  meetsToday,
  doc,
  onPress,
}: {
  width: number;
  name: string;
  schedule: string;
  students: number;
  meetsToday: boolean;
  doc?: AttendanceDoc;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const c = doc && !doc.holiday ? counts(Object.values(doc.marks)) : null;
  const present = c ? c.P + c.L : 0;
  const total = c ? c.P + c.L + c.A : 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${t(doc ? 'desktop.attendance.edit' : 'desktop.attendance.mark')}`}
      style={(s: HoverState) => [
        card,
        {
          width,
          padding: 20,
          gap: spacing.md,
          borderColor: s.hovered ? colors.ring : colors.border,
          opacity: meetsToday || doc ? 1 : 0.85,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={type.heading} numberOfLines={1}>
            {name}
          </Text>
          <Text style={type.footnote} numberOfLines={1}>
            {schedule}
          </Text>
        </View>
        {meetsToday ? <Chip small tone="accent" label={t('attendance.classToday')} /> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="people-outline" size={16} color={colors.textMuted} />
        <Text style={[type.subhead, { flex: 1, color: colors.textMuted }]}>
          {t('desktop.attendance.students', { count: students })}
        </Text>
        {!doc ? (
          <Chip small tone="warning" label={t('attendance.notMarked')} />
        ) : doc.holiday ? (
          <Chip
            small
            label={t(doc.reason === 'cancelled' ? 'attendance.cancelled' : 'attendance.holiday')}
          />
        ) : (
          <Chip
            small
            tone={presentTone(present, total)}
            label={t('attendance.presentOf', { present, total })}
          />
        )}
      </View>

      {c && total ? (
        <View
          style={{ height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' }}
        >
          <View
            style={{
              width: `${Math.round((present / total) * 100)}%`,
              height: '100%',
              backgroundColor: colors.successFill,
            }}
          />
        </View>
      ) : null}

      {/* drawn like a button; the whole card is the one button (a button cannot sit inside another) */}
      <View
        style={{
          height: 36,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: doc ? colors.surface : colors.primary,
          borderWidth: 1,
          borderColor: doc ? colors.input : colors.primary,
        }}
      >
        <Text style={[type.label, { color: doc ? colors.text : colors.onPrimary }]}>
          {t(doc ? 'desktop.attendance.edit' : 'desktop.attendance.mark')}
        </Text>
      </View>
    </Pressable>
  );
}
