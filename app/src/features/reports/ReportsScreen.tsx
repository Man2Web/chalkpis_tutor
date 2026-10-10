import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  toast,
} from '../../components';
import {
  useAttendanceRange,
  useBatches,
  useDuesForPeriod,
  useInstitute,
  usePaymentsInMonth,
  useStudents,
} from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { lastOfMonth, todayYmd } from '../../lib/dates';
import { toCsv } from '../../lib/csv';
import { shareBinaryFile, shareTextFile } from '../../lib/exportFile';
import { buildXlsx } from '../../lib/xlsx';
import { formatINR } from '../../lib/money';
import { sharePdfHtml } from '../../lib/pdf';
import { LOW_ATTENDANCE_PERCENT, PAY_MODES } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, TAP, type } from '../../theme';
import { lowAttendance, overallStat, studentStats } from '../attendance/logic';
import { periodLabel } from '../fees/logic';
import {
  attendanceTrend,
  collectionReport,
  feeStatusRows,
  reportCsvRows,
  reportHtml,
  type ReportData,
  type ReportLabels,
} from './logic';

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export function ReportsScreen() {
  const { t, i18n } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const thisMonth = todayYmd().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';

  const from = `${month}-01`;
  const last = lastOfMonth(from);
  const to = last > todayYmd() ? todayYmd() : last;

  const dues = useDuesForPeriod(month);
  const payments = usePaymentsInMonth(month);
  const attendance = useAttendanceRange(from, to);
  const students = useStudents();
  const batches = useBatches();
  const institute = useInstitute();
  const [busy, setBusy] = useState(false);

  const loading =
    dues.isLoading ||
    payments.isLoading ||
    attendance.isLoading ||
    students.isLoading ||
    batches.isLoading;
  const failed = dues.isError || payments.isError || attendance.isError;

  const model = useMemo(() => {
    const docs = attendance.data ?? [];
    const stats = studentStats(docs);
    const overall = overallStat(docs);
    const byId = new Map((students.data ?? []).map((s) => [s.id, s]));
    const rows = [...stats]
      .map(([id, stat]) => ({
        name: byId.get(id)?.name ?? '—',
        className: byId.get(id)?.class ?? '',
        stat,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      collection: collectionReport(dues.data ?? [], payments.data ?? []),
      trend: attendanceTrend(docs),
      low: lowAttendance(stats).map((l) => ({ ...l, name: byId.get(l.studentId)?.name ?? '—' })),
      overall,
      rows,
      fees: feeStatusRows(dues.data ?? [], students.data ?? []),
    };
  }, [dues.data, payments.data, attendance.data, students.data]);

  const data: ReportData = {
    month,
    institute: institute.data?.name ?? '',
    collection: model.collection,
    batches: (batches.data ?? []).map((b) => ({ id: b.id, name: b.name })),
    students: model.rows,
    fees: model.fees,
    attendancePct: model.overall.pct,
    sessions: model.overall.sessions,
  };

  const batchName = (id: string | null) =>
    id ? (batches.data?.find((b) => b.id === id)?.name ?? '—') : t('reports.noBatch');
  const c = model.collection;

  const exportCsv = async () => {
    setBusy(true);
    try {
      await shareTextFile(`chalkpis-report-${month}.csv`, toCsv(reportCsvRows(data)));
    } catch (e) {
      reportError(e);
      toast(t('reports.exportFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    setBusy(true);
    try {
      await shareBinaryFile(
        `chalkpis-report-${month}.xlsx`,
        buildXlsx(reportCsvRows(data, true), month),
      );
    } catch (e) {
      reportError(e);
      toast(t('reports.exportFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    setBusy(true);
    try {
      const L = Object.fromEntries(
        [
          'title',
          'collection',
          'billed',
          'collected',
          'pending',
          'waived',
          'byMode',
          'byBatch',
          'attendance',
          'average',
          'classes',
          'student',
          'present',
          'late',
          'absent',
          'percent',
          'noBatch',
        ].map((k) => [k, t(`reports.pdf.${k}`)]),
      ) as ReportLabels;
      await sharePdfHtml(
        reportHtml(data, L, formatINR, (m) => t(`fees.mode.${m}`), periodLabel(month, locale)),
        `report-${month}`,
      );
    } catch (e) {
      reportError(e);
      toast(t('reports.exportFailed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const arrow = (dir: -1 | 1, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(dir === -1 ? 'reports.prevMonth' : 'reports.nextMonth')}
      disabled={disabled}
      onPress={() => setMonth(shiftMonth(month, dir))}
      style={{
        width: TAP,
        height: TAP,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <Ionicons
        name={dir === -1 ? 'chevron-back' : 'chevron-forward'}
        size={24}
        color={colors.primary}
      />
    </Pressable>
  );

  const money = (label: string, value: number, tone?: string) => (
    <View
      style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs }}
    >
      <Text style={type.body}>{label}</Text>
      <Text style={[type.label, tone ? { color: tone } : null]}>{formatINR(value)}</Text>
    </View>
  );

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={type.title}>{t('reports.title')}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          {arrow(-1, false)}
          <Text style={type.heading}>{periodLabel(month, locale)}</Text>
          {arrow(1, month >= thisMonth)}
        </View>

        {loading ? (
          <Skeleton height={160} />
        ) : failed ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t('common.error')}
            actionLabel={t('common.retry')}
            onAction={() => {
              void dues.refetch();
              void payments.refetch();
              void attendance.refetch();
            }}
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                title={t('reports.exportExcel')}
                onPress={exportExcel}
                disabled={busy}
              />
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                title={t('reports.exportCsv')}
                onPress={exportCsv}
                disabled={busy}
              />
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                title={t('reports.exportPdf')}
                onPress={exportPdf}
                disabled={busy}
              />
            </View>

            <Card style={{ gap: spacing.xs }}>
              <Text style={type.heading}>{t('reports.collection')}</Text>
              {money(t('reports.billed'), c.billed)}
              {money(t('reports.collected'), c.collected, colors.success)}
              {money(t('reports.pending'), c.pending, c.pending ? colors.warning : undefined)}
              {c.waived ? money(t('reports.waived'), c.waived) : null}
            </Card>

            <Card style={{ gap: spacing.xs }}>
              <Text style={type.heading}>{t('reports.byMode')}</Text>
              {PAY_MODES.map((m) => (
                <View key={m}>{money(t(`fees.mode.${m}`), c.byMode[m])}</View>
              ))}
            </Card>

            {c.byBatch.length > 0 ? (
              <Card style={{ gap: spacing.xs }}>
                <Text style={type.heading}>{t('reports.byBatch')}</Text>
                {c.byBatch.map((b) => (
                  <View key={b.batchId ?? 'none'}>{money(batchName(b.batchId), b.amount)}</View>
                ))}
              </Card>
            ) : null}

            <Card style={{ gap: spacing.sm }}>
              <Text style={type.heading}>{t('reports.attendanceTrend')}</Text>
              {model.trend.length === 0 ? (
                <Text style={type.caption}>{t('attendance.noData')}</Text>
              ) : (
                <>
                  <Text style={type.caption}>
                    {t('attendance.average')}: {model.overall.pct}% •{' '}
                    {t('attendance.sessions', { count: model.overall.sessions })}
                  </Text>
                  <View
                    accessibilityLabel={t('reports.attendanceTrend')}
                    style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 2 }}
                  >
                    {model.trend.map((p) => (
                      <View
                        key={p.date}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          height: '100%',
                        }}
                      >
                        <View
                          style={{
                            width: '100%',
                            height: `${Math.max(4, p.pct)}%`,
                            borderRadius: 3,
                            backgroundColor:
                              p.pct < LOW_ATTENDANCE_PERCENT ? colors.danger : colors.primary,
                          }}
                        />
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={type.caption}>{model.trend[0].date.slice(8)}</Text>
                    <Text style={type.caption}>
                      {model.trend[model.trend.length - 1].date.slice(8)}
                    </Text>
                  </View>
                </>
              )}
            </Card>

            <Card
              style={{
                gap: spacing.sm,
                borderColor: model.low.length ? colors.danger : colors.border,
              }}
            >
              <Text style={type.heading}>
                {t('attendance.lowTitle', { percent: LOW_ATTENDANCE_PERCENT })}
              </Text>
              {model.low.length === 0 ? (
                <Text style={type.caption}>{t('attendance.noneLow')}</Text>
              ) : (
                model.low.map((l) => (
                  <ListItem
                    key={l.studentId}
                    title={l.name}
                    subtitle={t('attendance.breakdown', {
                      p: l.stat.present,
                      l: l.stat.late,
                      a: l.stat.absent,
                    })}
                    right={<Chip label={`${l.stat.pct}%`} tone="danger" />}
                    onPress={() => nav.navigate('StudentProfile', { id: l.studentId })}
                  />
                ))
              )}
              <Button
                variant="ghost"
                title={t('reports.fullAttendance')}
                onPress={() => nav.navigate('AttendanceReport')}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
