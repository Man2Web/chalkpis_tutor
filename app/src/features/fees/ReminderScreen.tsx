import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Chip, EmptyState, Input, Screen, Skeleton, toast } from '../../components';
import { useInstitute, useStudentDues, useStudents } from '../../data/hooks';
import { open, smsUrl, whatsappUrl } from '../../lib/contact';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { buildReminder, type DocLang } from './documents';
import { outstanding, periodSpan } from './logic';

export function ReminderScreen({ route }: NativeStackScreenProps<MainStackParams, 'Reminder'>) {
  const { t, i18n } = useTranslation();
  const students = useStudents();
  const dues = useStudentDues(route.params.studentId);
  const institute = useInstitute();
  const student = students.data?.find((s) => s.id === route.params.studentId);
  const [lang, setLang] = useState<DocLang>(i18n.language === 'hi' ? 'hi' : 'en');
  const [custom, setCustom] = useState<string>();

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
  });
  const text = custom ?? generated;

  const send = async (url: string) => {
    if (!(await open(url))) toast(t('students.cannotOpen'), 'error');
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
    </Screen>
  );
}
