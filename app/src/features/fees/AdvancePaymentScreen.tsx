import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { useIdempotencyKey } from '../../api/idempotency';
import { Button, Card, Chip, EmptyState, Input, Screen, Skeleton, toast } from '../../components';
import { useRefreshData, useStudentDues, useStudents } from '../../data/hooks';
import { reportError, track } from '../../lib/analytics';
import { todayYmd, toYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { PAY_MODES, type PayMode } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { advanceMonths, advanceTotal } from './advance';
import { outstanding, periodLabel } from './logic';
import { PaidOnField } from './PaidOnField';

/** A parent pays several months at once: pick the months, the way they paid, done. One receipt per month. */
export function AdvancePaymentScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'AdvancePayment'>) {
  const { t, i18n } = useTranslation();
  const { studentId } = route.params;
  const students = useStudents();
  const dues = useStudentDues(studentId);
  const refresh = useRefreshData();
  const [picked, setPicked] = useState<string[]>([]);
  const [mode, setMode] = useState<PayMode>('upi');
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const idem = useIdempotencyKey();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';

  if (students.isLoading || dues.isLoading)
    return (
      <Screen>
        <Skeleton height={160} />
      </Screen>
    );
  // a failed load with nothing cached is not "not found": offer to try again
  if ((students.isError && !students.data) || (dues.isError && !dues.data))
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => {
            if (students.isError) void students.refetch();
            if (dues.isError) void dues.refetch();
          }}
        />
      </Screen>
    );
  const s = students.data?.find((x) => x.id === studentId);
  if (!s)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );
  if (s.feeCycle !== 'monthly' || !s.monthlyFee)
    return (
      <Screen>
        <EmptyState icon="information-circle-outline" title={t('fees.advanceMonthlyOnly')} />
      </Screen>
    );

  const regular = (dues.data ?? []).filter((d) => !d.kind);
  const existing = regular.map((d) => ({
    period: d.period,
    owe: d.status === 'waived' ? 0 : outstanding(d),
  }));
  const settled = new Set(existing.filter((d) => d.owe === 0).map((d) => d.period));
  // the joining month in Indian time: a student who joined at midnight on the 1st joined that month, not the one before
  const joined = toYmd(s.joinedAt.toDate()).slice(0, 7);
  const months = advanceMonths(todayYmd()).filter((m) => m >= joined && !settled.has(m));
  if (!months.length)
    return (
      <Screen>
        <EmptyState
          icon="checkmark-circle-outline"
          title={t('fees.advanceAllPaid')}
          message={t('fees.advanceAllPaidHint')}
        />
      </Screen>
    );
  const dateBad = !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayYmd();
  const total = advanceTotal(
    picked,
    { monthly: s.monthlyFee, discount: s.discount ?? 0 },
    existing,
  );

  const toggle = (m: string) =>
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m].sort()));

  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ total: number; payments: { receiptNo: string }[] }>(
        'POST',
        '/fees/advance',
        { studentId, months: picked, mode, paidOn: date, note: note.trim() },
        { idempotencyKey: idem.key },
      );
      idem.reset();
      track('payment_recorded');
      await refresh();
      toast(
        t('fees.advanceDone', { amount: formatINR(r.total), count: r.payments.length }),
        'success',
      );
      navigation.goBack();
    } catch (e) {
      idem.settle(e);
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'already_paid') toast(t('fees.advanceNothing'), 'error');
      // a month before the student joined, or further ahead than a year: not a connection problem
      else if (code === 'bad_month') toast(t('fees.advanceBadMonth'), 'error');
      else if (code === 'bad_date') toast(t('validation.date'), 'error');
      else if (code === 'student_not_billable') toast(t('fees.advanceMonthlyOnly'), 'error');
      else {
        reportError(e);
        toast(t('fees.recordFailed'), 'error');
      }
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Text style={[type.caption, { marginBottom: spacing.sm }]}>
        {s.name} • {t('fees.perMonth', { amount: formatINR(s.monthlyFee) })}
      </Text>
      <Text style={type.fieldLabel}>{t('fees.advanceWhich')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {months.map((m) => (
          <Chip
            key={m}
            label={periodLabel(m, locale)}
            selected={picked.includes(m)}
            onPress={() => toggle(m)}
          />
        ))}
      </View>
      <Text style={[type.fieldLabel, { marginTop: spacing.md }]}>{t('fees.paidBy')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {PAY_MODES.map((pm) => (
          <Chip
            key={pm}
            label={t(`fees.mode.${pm}`)}
            selected={mode === pm}
            onPress={() => setMode(pm)}
          />
        ))}
      </View>
      <View style={{ height: spacing.md }} />
      <PaidOnField
        value={date}
        onChange={setDate}
        error={dateBad ? t('validation.date') : undefined}
      />
      <Input label={t('fees.note')} value={note} onChangeText={setNote} maxLength={200} />
      <Card style={{ gap: 2, marginBottom: spacing.md }}>
        <Text style={type.caption}>{t('fees.advanceTotal', { count: picked.length })}</Text>
        <Text style={type.title2}>{formatINR(total)}</Text>
        <Text style={type.caption}>{t('fees.advanceHint')}</Text>
      </Card>
      <Button
        title={t('fees.advanceSave', { amount: formatINR(total) })}
        onPress={save}
        loading={busy}
        disabled={!picked.length || dateBad}
      />
    </Screen>
  );
}
