import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, EmptyState, Input, Screen, Skeleton, toast } from '../../components';
import { useDue, useInstituteId, useRefreshData, useStudents } from '../../data/hooks';
import { reportError, track } from '../../lib/analytics';
import { todayYmd } from '../../lib/dates';
import { formatINR, parseRupeesToPaise } from '../../lib/money';
import { PAY_MODES, type PayMode } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { recordPayment, type FeeApiError } from './api';
import { applyPayment, outstanding, periodLabel } from './logic';

const ERRORS: FeeApiError[] = ['amount', 'exceeds', 'waived', 'notFound'];

export function CollectFeeScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'CollectFee'>) {
  const { t } = useTranslation();
  const { dueId } = route.params;
  const instituteId = useInstituteId();
  const uid = useSession((s) => s.uid) as string;
  const refresh = useRefreshData();
  const due = useDue(dueId);
  const students = useStudents();
  const student = students.data?.find((s) => s.id === due.data?.studentId);

  const [amountText, setAmountText] = useState<string>();
  const [mode, setMode] = useState<PayMode>('cash');
  const [date, setDate] = useState(todayYmd());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (due.isLoading || students.isLoading)
    return (
      <Screen>
        <Skeleton height={96} />
      </Screen>
    );
  const d = due.data;
  if (!d)
    return (
      <Screen>
        <EmptyState title={t('fees.notFound')} />
      </Screen>
    );

  const owe = outstanding(d);
  const text = amountText ?? String(owe / 100);
  const paise = parseRupeesToPaise(text);
  const preview = paise !== null && paise > 0 ? applyPayment(d, paise) : null;
  const balanceAfter = preview && !('error' in preview) ? owe - paise! : null;
  const dateBad = !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayYmd();

  const submit = async () => {
    setError(undefined);
    if (paise === null || paise <= 0) return setError(t('fees.errors.amount'));
    if (paise > owe) return setError(t('fees.errors.exceeds', { max: formatINR(owe) }));
    if (dateBad) return setError(t('validation.date'));
    setBusy(true);
    try {
      const { paymentId } = await recordPayment({
        instituteId,
        uid,
        dueId,
        amount: paise,
        mode,
        paidOn: date,
        note,
      });
      track('payment_recorded');
      await refresh();
      navigation.replace('Receipt', { paymentId });
    } catch (e) {
      const key = (e as Error).message as FeeApiError;
      if (ERRORS.includes(key)) setError(t(`fees.errors.${key}`, { max: formatINR(owe) }));
      else {
        reportError(e);
        toast(t('fees.recordFailed'), 'error');
      }
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: spacing.xs }}>
        <Text style={type.heading}>{student?.name ?? '—'}</Text>
        <Text style={type.caption}>
          {d.description} • {periodLabel(d.period)}
        </Text>
        <Text style={type.body}>{t('fees.balanceDue', { amount: formatINR(owe) })}</Text>
      </Card>

      <View style={{ height: spacing.md }} />
      <Input
        label={t('fees.amountReceived')}
        value={text}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        error={error}
      />
      {balanceAfter !== null ? (
        <Text style={[type.caption, { marginBottom: spacing.md }]}>
          {t(balanceAfter === 0 ? 'fees.fullyPaid' : 'fees.balanceAfter', {
            amount: formatINR(balanceAfter),
          })}
        </Text>
      ) : null}

      <Text style={type.fieldLabel}>{t('fees.paidBy')}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        {PAY_MODES.map((m) => (
          <Chip
            key={m}
            label={t(`fees.mode.${m}`)}
            selected={mode === m}
            onPress={() => setMode(m)}
          />
        ))}
      </View>
      <Input
        label={t('fees.paymentDate')}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        error={dateBad ? t('validation.date') : undefined}
      />
      <Input label={t('fees.note')} value={note} onChangeText={setNote} maxLength={200} />
      <Button title={t('fees.record')} onPress={submit} loading={busy} disabled={dateBad} />
    </Screen>
  );
}
