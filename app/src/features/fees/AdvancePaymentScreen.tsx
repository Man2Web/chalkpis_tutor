import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { Button, Card, Chip, EmptyState, Screen, Skeleton, toast } from '../../components';
import { useRefreshData, useStudentDues, useStudents } from '../../data/hooks';
import { reportError, track } from '../../lib/analytics';
import { todayYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { PAY_MODES, type PayMode } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { advanceMonths, advanceTotal } from './advance';
import { outstanding, periodLabel } from './logic';

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
  const [busy, setBusy] = useState(false);
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';

  if (students.isLoading || dues.isLoading)
    return (
      <Screen>
        <Skeleton height={160} />
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
  const joined = s.joinedAt.toDate().toISOString().slice(0, 7);
  const months = advanceMonths(todayYmd()).filter((m) => m >= joined && !settled.has(m));
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
        { studentId, months: picked, mode },
      );
      track('payment_recorded');
      await refresh();
      toast(
        t('fees.advanceDone', { amount: formatINR(r.total), count: r.payments.length }),
        'success',
      );
      navigation.goBack();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'already_paid')
        toast(t('fees.advanceNothing'), 'error');
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
      <Card style={{ marginTop: spacing.md, gap: 2 }}>
        <Text style={type.caption}>{t('fees.advanceTotal', { count: picked.length })}</Text>
        <Text style={[type.heading, { fontSize: 24 }]}>{formatINR(total)}</Text>
        <Text style={type.caption}>{t('fees.advanceHint')}</Text>
      </Card>
      <Button
        title={t('fees.advanceSave', { amount: formatINR(total) })}
        onPress={save}
        loading={busy}
        disabled={!picked.length}
      />
    </Screen>
  );
}
