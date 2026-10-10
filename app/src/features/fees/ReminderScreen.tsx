import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../../api/client';
import { Button, Card, EmptyState, Screen, Section, Skeleton, toast } from '../../components';
import { UpiQr } from '../../components/UpiQr';
import {
  useInstitute,
  useInstituteId,
  useRefreshData,
  useStudentDues,
  useStudents,
} from '../../data/hooks';
import { reportError, track } from '../../lib/analytics';
import { formatINR } from '../../lib/money';
import { nationalNumber } from '../../lib/phone';
import { upiLink } from '../../lib/upi';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { recordPayment } from './api';
import { reminderKind, reminderPreview } from './documents';
import { outstanding, periodSpan } from './logic';

/**
 * Fee reminder: shows exactly what the parent will get on WhatsApp (the UPI QR picture or the payment link, and the
 * approved message), then the server sends it through the WhatsApp API.
 */
export function ReminderScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'Reminder'>) {
  const { t } = useTranslation();
  const students = useStudents();
  const dues = useStudentDues(route.params.studentId);
  const institute = useInstitute();
  const student = students.data?.find((s) => s.id === route.params.studentId);
  const instituteId = useInstituteId();
  const uid = useSession((s) => s.uid) as string;
  const refresh = useRefreshData();
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (students.isLoading || dues.isLoading || institute.isLoading)
    return (
      <Screen>
        <Skeleton height={96} />
      </Screen>
    );
  if (!student)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );

  const unpaid = (dues.data ?? [])
    .filter((d) => outstanding(d) > 0)
    .sort((a, b) => a.period.localeCompare(b.period));
  const total = unpaid.reduce((s, d) => s + outstanding(d), 0);
  if (unpaid.length === 0)
    return (
      <Screen>
        <EmptyState icon="checkmark-circle-outline" title={t('fees.nothingDue')} />
      </Screen>
    );

  const inst = institute.data;
  const kind = reminderKind({ payLink: inst?.paymentLink, upiId: inst?.upiId });
  const text = reminderPreview(kind, {
    studentName: student.name,
    amount: formatINR(total),
    period: periodSpan(
      unpaid.map((d) => d.period),
      'en-IN',
    ),
    institute: inst?.name ?? '',
    payLink: inst?.paymentLink,
  });

  const send = async () => {
    setSending(true);
    try {
      await api('POST', `/students/${student.id}/remind`);
      toast(t('fees.reminderSent'), 'success');
      navigation.goBack();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'recently_sent') toast(t('fees.reminderRecent'), 'error');
      else if (code === 'nothing_due') toast(t('fees.nothingDue'), 'error');
      else {
        reportError(e);
        toast(t('fees.reminderFailed'), 'error');
      }
      setSending(false);
    }
  };

  /** Records every unpaid due in full as received by UPI. The server queues the receipt message in the same step. */
  const markPaid = async () => {
    setBusy(true);
    try {
      let last: string | undefined;
      for (const d of unpaid)
        last = (
          await recordPayment({
            instituteId,
            uid,
            dueId: d.id,
            amount: outstanding(d),
            mode: 'upi',
          })
        ).paymentId;
      track('payment_recorded');
      await refresh();
      toast(t('fees.markPaidDone'), 'success');
      if (last && unpaid.length === 1) navigation.replace('Receipt', { paymentId: last });
      else navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('fees.recordFailed'), 'error');
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: 2, marginBottom: spacing.lg }}>
        <Text style={type.footnote}>{t('fees.totalDue')}</Text>
        <Text style={type.largeTitle}>{formatINR(total)}</Text>
        <Text style={[type.subhead, { color: colors.textMuted }]}>
          {student.name} · {nationalNumber(student.parentPhone)}
        </Text>
      </View>

      <Section title={t('fees.parentWillGet')} footer={t('fees.viaApi')}>
        <View style={{ backgroundColor: '#ECE5DD', padding: spacing.md }}>
          <View
            style={{
              alignSelf: 'flex-start',
              maxWidth: '92%',
              backgroundColor: '#FFFFFF',
              borderRadius: radius.md,
              borderTopLeftRadius: 4,
              padding: spacing.sm,
              gap: spacing.sm,
            }}
          >
            {kind === 'qr' && inst?.upiId ? (
              <View
                style={{
                  alignItems: 'center',
                  backgroundColor: '#FFFFFF',
                  paddingVertical: spacing.sm,
                }}
              >
                <UpiQr
                  value={upiLink({
                    upiId: inst.upiId,
                    payeeName: inst.name,
                    amountPaise: total,
                    note: `${student.name} fee`,
                  })}
                  size={180}
                />
              </View>
            ) : null}
            <Text style={[type.subhead, { lineHeight: 21 }]}>{text}</Text>
          </View>
        </View>
      </Section>

      {kind === 'text' ? (
        <Card
          style={{
            flexDirection: 'row',
            gap: spacing.md,
            alignItems: 'center',
            marginBottom: spacing.lg,
          }}
        >
          <Ionicons name="information-circle" size={22} color={colors.warningFill} />
          <Text style={[type.footnote, { flex: 1, color: colors.text }]}>
            {t('fees.upiMissing')}
          </Text>
          <Button
            size="small"
            variant="secondary"
            title={t('fees.noUpiAction')}
            onPress={() => navigation.navigate('PaymentSettings')}
          />
        </Card>
      ) : null}

      <Button title={t('fees.sendWhatsapp')} onPress={send} loading={sending} />

      {confirming ? (
        <Card style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text style={type.body}>{t('fees.markPaidAsk', { amount: formatINR(total) })}</Text>
          <Button title={t('fees.markPaidConfirm')} onPress={markPaid} loading={busy} />
          <Button
            variant="ghost"
            title={t('common.cancel')}
            onPress={() => setConfirming(false)}
            disabled={busy}
          />
        </Card>
      ) : (
        <Button
          variant="secondary"
          title={t('fees.markPaid')}
          onPress={() => setConfirming(true)}
          style={{ marginTop: spacing.sm }}
        />
      )}
    </Screen>
  );
}
