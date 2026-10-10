import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import type Svg from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Card, Chip, EmptyState, Input, Screen, Skeleton, toast } from '../../components';
import { UpiQr } from '../../components/UpiQr';
import {
  useInstitute,
  useInstituteId,
  useRefreshData,
  useStudentDues,
  useStudents,
} from '../../data/hooks';
import { reportError, track } from '../../lib/analytics';
import { upiLink } from '../../lib/upi';
import { useSession } from '../auth/session';
import { recordPayment } from './api';
import { open, smsUrl, whatsappUrl } from '../../lib/contact';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { buildReminder, type DocLang } from './documents';
import { outstanding, periodSpan } from './logic';

export function ReminderScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'Reminder'>) {
  const { t, i18n } = useTranslation();
  const students = useStudents();
  const dues = useStudentDues(route.params.studentId);
  const institute = useInstitute();
  const student = students.data?.find((s) => s.id === route.params.studentId);
  const [lang, setLang] = useState<DocLang>(i18n.language === 'hi' ? 'hi' : 'en');
  const [custom, setCustom] = useState<string>();
  const instituteId = useInstituteId();
  const uid = useSession((s) => s.uid) as string;
  const refresh = useRefreshData();
  const qrRef = useRef<Svg>(null);
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
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const period = periodSpan(
    unpaid.map((d) => d.period),
    locale,
  );

  const generated = buildReminder(lang, {
    parentName: student.parentName,
    studentName: student.name,
    amount: formatINR(total),
    period,
    institute: institute.data?.name ?? '',
    upiId: institute.data?.upiId || undefined,
  });
  const text = custom ?? generated;

  const send = async (url: string) => {
    if (!(await open(url))) toast(t('students.cannotOpen'), 'error');
  };

  const upiId = institute.data?.upiId ?? '';
  const qrValue = upiId
    ? upiLink({
        upiId,
        payeeName: institute.data?.name ?? '',
        amountPaise: total,
        note: `${student.name} fee`,
      })
    : '';

  /** The QR as a picture, so the tutor can attach it to the WhatsApp chat. Phones only. */
  const shareQr = () => {
    qrRef.current?.toDataURL(async (b64: string) => {
      try {
        const file = new File(Paths.cache, `upi-${student.id}.png`);
        file.create({ overwrite: true });
        file.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png' });
      } catch (e) {
        reportError(e);
        toast(t('common.error'), 'error');
      }
    });
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

  if (unpaid.length === 0)
    return (
      <Screen>
        <EmptyState icon="checkmark-circle-outline" title={t('fees.nothingDue')} />
      </Screen>
    );

  return (
    <Screen>
      <Text style={type.title}>{t('fees.remind')}</Text>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>
        {student.name} • {formatINR(total)}
      </Text>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
        <Chip
          label="English"
          selected={lang === 'en'}
          onPress={() => {
            setLang('en');
            setCustom(undefined);
          }}
        />
        <Chip
          label="हिन्दी"
          selected={lang === 'hi'}
          onPress={() => {
            setLang('hi');
            setCustom(undefined);
          }}
        />
      </View>
      <Card style={{ alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
        <Text style={type.heading}>{t('fees.upiQrTitle')}</Text>
        {qrValue ? (
          <>
            <UpiQr ref={qrRef} value={qrValue} />
            <Text style={type.caption}>
              {t('fees.upiQrCaption', { amount: formatINR(total), name: institute.data?.name })}
            </Text>
            <Text style={type.caption}>{upiId}</Text>
            {Platform.OS !== 'web' ? (
              <Button variant="secondary" title={t('fees.shareQr')} onPress={shareQr} />
            ) : null}
          </>
        ) : (
          <Text style={type.caption}>{t('fees.upiMissing')}</Text>
        )}
      </Card>
      <Input
        label={t('fees.message')}
        value={text}
        onChangeText={setCustom}
        multiline
        numberOfLines={6}
        style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: spacing.md }}
      />
      <Button
        title={t('fees.sendWhatsapp')}
        onPress={() => send(whatsappUrl(student.parentPhone, text))}
      />
      <Button
        variant="secondary"
        title={t('fees.sendSms')}
        onPress={() => send(smsUrl(student.parentPhone, text))}
      />
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
          style={{ marginTop: spacing.md }}
        />
      )}
    </Screen>
  );
}
