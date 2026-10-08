import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import {
  useAttendanceDoc,
  useBatches,
  useInstituteId,
  useRefreshData,
  useStudents,
} from '../../data/hooks';
import { reportError, track } from '../../lib/analytics';
import { prettyDate, todayYmd } from '../../lib/dates';
import type { Mark } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, TAP, type } from '../../theme';
import { useSession } from '../auth/session';
import { saveAttendance } from './api';
import { DateStrip } from './DateStrip';
import { buildRoster, counts, tapMark } from './logic';

const TONE: Record<Mark, { bg: string; fg: string; key: string }> = {
  P: { bg: colors.successSoft, fg: colors.success, key: 'attendance.present' },
  A: { bg: colors.dangerSoft, fg: colors.danger, key: 'attendance.absent' },
  L: { bg: colors.warningSoft, fg: colors.warning, key: 'attendance.late' },
};

export function MarkAttendanceScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'MarkAttendance'>) {
  const { t, i18n } = useTranslation();
  const { batchId } = route.params;
  const [date, setDate] = useState(route.params.date);
  const instituteId = useInstituteId();
  const uid = useSession((s) => s.uid) as string;
  const refresh = useRefreshData();
  const students = useStudents();
  const batches = useBatches();
  const saved = useAttendanceDoc(batchId, date);
  const batch = batches.data?.find((b) => b.id === batchId);

  // Edits are keyed by date so switching days never carries marks over.
  const [edits, setEdits] = useState<{ date: string; marks: Record<string, Mark> }>({
    date,
    marks: {},
  });
  const [dayType, setDayType] = useState<{
    date: string;
    value: 'holiday' | 'cancelled' | null;
  } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const savedDoc = saved.data;
  const rows = useMemo(
    () => buildRoster(students.data ?? [], batchId, date, savedDoc?.marks),
    [students.data, batchId, date, savedDoc],
  );
  const local = edits.date === date ? edits.marks : {};
  const marks = useMemo(() => {
    const m: Record<string, Mark> = {};
    for (const r of rows) m[r.student.id] = local[r.student.id] ?? r.mark;
    return m;
  }, [rows, local]);
  const c = counts(Object.values(marks));

  const holiday =
    dayType?.date === date
      ? dayType.value
      : savedDoc?.holiday
        ? (savedDoc.reason ?? 'holiday')
        : null;
  const future = date > todayYmd();

  // Functional update: two quick taps in a row must both count.
  const baseMark = useMemo(() => new Map(rows.map((r) => [r.student.id, r.mark])), [rows]);
  const setMark = (id: string) =>
    setEdits((prev) => tapMark(prev, date, id, baseMark.get(id) ?? 'P'));
  const markAllPresent = () =>
    setEdits({ date, marks: Object.fromEntries(rows.map((r) => [r.student.id, 'P' as Mark])) });

  const save = async () => {
    setBusy(true);
    try {
      await saveAttendance({
        instituteId,
        uid,
        batchId,
        date,
        marks,
        holiday: holiday ?? undefined,
        createdAt: (savedDoc as { createdAt?: unknown } | null | undefined)?.createdAt,
      });
      track('attendance_saved');
      await refresh();
      toast(t('attendance.saved'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  };

  if (students.isLoading || batches.isLoading || saved.isLoading) {
    return (
      <Screen>
        <Skeleton height={64} />
      </Screen>
    );
  }
  if (!batch)
    return (
      <Screen>
        <EmptyState title={t('batches.notFound')} />
      </Screen>
    );

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text style={type.title}>{batch.name}</Text>
        <DateStrip date={date} onChange={setDate} />
        {future ? (
          <Text style={[type.caption, { color: colors.danger }]}>{t('attendance.future')}</Text>
        ) : null}
        {holiday ? (
          <Card style={{ backgroundColor: colors.primarySoft, gap: spacing.sm }}>
            <Text style={type.label}>
              {t(
                holiday === 'cancelled' ? 'attendance.markedCancelled' : 'attendance.markedHoliday',
              )}
            </Text>
            <Text style={type.caption}>{t('attendance.excluded')}</Text>
            <Button
              variant="secondary"
              title={t('attendance.undoHoliday')}
              onPress={() => setDayType({ date, value: null })}
            />
          </Card>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Chip label={`${t('attendance.present')} ${c.P}`} tone="success" />
              <Chip label={`${t('attendance.absent')} ${c.A}`} tone="danger" />
              <Chip label={`${t('attendance.late')} ${c.L}`} tone="warning" />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                title={t('attendance.markAll')}
                onPress={markAllPresent}
              />
              <Button
                style={{ flex: 1 }}
                variant="ghost"
                title={t('attendance.holidayOrCancel')}
                onPress={() => setSheet(true)}
              />
            </View>
            <Text style={type.caption}>{t('attendance.tapHint')}</Text>
          </>
        )}
      </View>

      {holiday ? (
        <View style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={rows}
          extraData={marks}
          keyExtractor={(r) => r.student.id}
          initialNumToRender={20}
          windowSize={9}
          ListEmptyComponent={
            <EmptyState
              icon="people-outline"
              title={t('attendance.noStudents')}
              message={t('attendance.noStudentsHint')}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border }} />
          )}
          renderItem={({ item }) => {
            const m = marks[item.student.id];
            const tone = TONE[m];
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.student.name}, ${t(tone.key)}`}
                onPress={() => setMark(item.student.id)}
                style={({ pressed }) => ({
                  minHeight: TAP + 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  backgroundColor: pressed ? colors.primarySoft : colors.surface,
                })}
              >
                <Avatar name={item.student.name} uri={item.student.photoUrl} size={40} />
                <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>
                  {item.student.name}
                </Text>
                <View
                  style={{
                    minWidth: 88,
                    minHeight: 40,
                    borderRadius: radius.pill,
                    backgroundColor: tone.bg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <Text style={{ color: tone.fg, fontWeight: '700' }}>{t(tone.key)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <View
        style={{
          padding: spacing.lg,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button
          title={t('common.save')}
          onPress={save}
          loading={busy}
          disabled={future || (!holiday && rows.length === 0)}
        />
      </View>

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title={`${t('attendance.holidayOrCancel')} • ${prettyDate(date, i18n.language === 'hi' ? 'hi-IN' : 'en-IN')}`}
      >
        <View style={{ gap: spacing.sm }}>
          <Button
            title={t('attendance.holiday')}
            onPress={() => {
              setDayType({ date, value: 'holiday' });
              setSheet(false);
            }}
          />
          <Button
            variant="secondary"
            title={t('attendance.cancelled')}
            onPress={() => {
              setDayType({ date, value: 'cancelled' });
              setSheet(false);
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
