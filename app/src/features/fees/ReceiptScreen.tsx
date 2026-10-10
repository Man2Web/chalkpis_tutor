import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import {
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
  useDue,
  useInstitute,
  useInstituteId,
  useRefreshData,
  usePayment,
  useStudentPayments,
  useStudents,
} from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import type { FeeApiError } from './api';
import { reversePayment } from './api';
import { reversedIds } from './logic';
import { receiptVars, shareReceiptPdf } from './receipt';

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: spacing.md,
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={type.caption}>{k}</Text>
      <Text style={[bold ? type.heading : type.body, { flexShrink: 1, textAlign: 'right' }]}>
        {v}
      </Text>
    </View>
  );
}

export function ReceiptScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'Receipt'>) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const uid = useSession((s) => s.uid) as string;
  const refresh = useRefreshData();
  const payment = usePayment(route.params.paymentId);
  const p = payment.data;
  const students = useStudents();
  const institute = useInstitute();
  const due = useDue(p?.dueId ?? '_');
  const history = useStudentPayments(p?.studentId ?? '_');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  if (payment.isLoading || students.isLoading || institute.isLoading)
    return (
      <Screen>
        <Skeleton height={160} />
      </Screen>
    );
  const student = students.data?.find((s) => s.id === p?.studentId);
  if (!p || !student || !institute.data)
    return (
      <Screen>
        <EmptyState title={t('fees.notFound')} />
      </Screen>
    );

  const isReversal = p.amount < 0;
  const reversed = reversedIds(history.data ?? []).has(p.id);
  const vars = receiptVars({
    payment: p,
    student,
    institute: institute.data,
    due: due.data ?? null,
    lang: 'en',
    modeLabel: t(`fees.mode.${p.mode}`),
  });

  const share = async () => {
    try {
      await shareReceiptPdf(vars);
    } catch (e) {
      reportError(e);
      toast(t('fees.shareFailed'), 'error');
    }
  };

  const sendWhatsApp = async () => {
    setSending(true);
    try {
      await api('POST', `/fees/payments/${p.id}/send-receipt`);
      toast(t('fees.receiptSent'), 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'recently_sent')
        toast(t('fees.receiptRecent'), 'error');
      else {
        reportError(e);
        toast(t('fees.receiptFailed'), 'error');
      }
    } finally {
      setSending(false);
    }
  };

  const reverse = async () => {
    setBusy(true);
    try {
      await reversePayment({ instituteId, uid, paymentId: p.id });
      await refresh();
      toast(t('fees.reversed'), 'success');
      setSheet(false);
      navigation.goBack();
    } catch (e) {
      const key = (e as Error).message as FeeApiError;
      if (key === 'alreadyReversed') toast(t('fees.alreadyReversed'), 'error');
      else {
        reportError(e);
        toast(t('common.error'), 'error');
      }
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={{ gap: spacing.xs }}>
        <Text style={type.heading}>{vars.institute}</Text>
        <Text style={type.caption}>{isReversal ? t('fees.reversalTitle') : t('fees.receipt')}</Text>
        {reversed ? <Chip label={t('fees.reversedChip')} tone="danger" /> : null}
        <View style={{ height: spacing.sm }} />
        {p.receiptNo ? <Row k={t('fees.receiptNo')} v={p.receiptNo} /> : null}
        <Row k={t('fees.date')} v={vars.date} />
        <Row k={t('fees.student')} v={vars.student} />
        <Row k={t('fees.for')} v={vars.description} />
        <Row k={t('fees.paidBy')} v={vars.mode} />
        {p.note ? <Row k={t('fees.note')} v={p.note} /> : null}
        <View style={{ height: spacing.sm }} />
        <Row
          k={isReversal ? t('fees.amountReturned') : t('fees.amountReceived')}
          v={vars.amount}
          bold
        />
        {!isReversal ? <Row k={t('fees.balance')} v={vars.balance} /> : null}
      </Card>

      <View style={{ height: spacing.lg }} />
      {!isReversal && !reversed ? (
        <Button title={t('fees.sendReceiptWhatsapp')} onPress={sendWhatsApp} loading={sending} />
      ) : null}
      {!isReversal ? (
        <Button variant="secondary" title={t('fees.sharePdf')} onPress={share} />
      ) : null}
      {!isReversal && !reversed ? (
        <Button variant="danger" title={t('fees.reverse')} onPress={() => setSheet(true)} />
      ) : null}
      <Button
        variant="ghost"
        title={t('fees.openLedger')}
        onPress={() => navigation.replace('FeeLedger', { studentId: p.studentId })}
      />

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={t('fees.reverseTitle')}>
        <Text style={[type.body, { marginBottom: spacing.md }]}>
          {t('fees.reverseHelp', { amount: vars.amount })}
        </Text>
        <View style={{ gap: spacing.sm }}>
          <Button
            variant="danger"
            title={t('fees.reverseConfirm')}
            onPress={reverse}
            loading={busy}
          />
          <Button
            variant="ghost"
            title={t('common.cancel')}
            onPress={() => setSheet(false)}
            disabled={busy}
          />
        </View>
        <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
          {t('fees.reverseNote')}
        </Text>
      </BottomSheet>
    </Screen>
  );
}
