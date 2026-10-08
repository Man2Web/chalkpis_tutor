import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Chip,
  EmptyState,
  FormInput,
  Input,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useInstituteId, useRefreshData, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { parseRupeesToPaise } from '../../lib/money';
import type { FeeCycle } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { updateFeePlan } from './api';

const schema = z.object({
  monthlyFee: z.string().refine((v) => parseRupeesToPaise(v) !== null, 'amount'),
  feeCycle: z.enum(['monthly', 'quarterly', 'one-time']),
  dueDay: z.number().int('dueDay').min(1, 'dueDay').max(31, 'dueDay'),
  discount: z.string().refine((v) => v === '' || parseRupeesToPaise(v) !== null, 'amount'),
});
type Form = z.infer<typeof schema>;
const CYCLES: FeeCycle[] = ['monthly', 'quarterly', 'one-time'];

export function FeePlanScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'FeePlan'>) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const students = useStudents();
  const student = students.data?.find((s) => s.id === route.params.studentId);
  const [busy, setBusy] = useState(false);

  const values: Form | undefined = useMemo(
    () =>
      student
        ? {
            monthlyFee: String(student.monthlyFee / 100),
            feeCycle: student.feeCycle,
            dueDay: student.dueDay,
            discount: String(((student as { discount?: number }).discount ?? 0) / 100),
          }
        : undefined,
    [student],
  );
  const { control, handleSubmit } = useForm<Form>({ resolver: zodResolver(schema), values });

  if (students.isLoading)
    return (
      <Screen>
        <Skeleton height={48} />
      </Screen>
    );
  if (!student)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );

  const submit = handleSubmit(async (f) => {
    setBusy(true);
    try {
      await updateFeePlan({
        instituteId,
        studentId: student.id,
        monthlyFee: parseRupeesToPaise(f.monthlyFee) ?? 0,
        feeCycle: f.feeCycle,
        dueDay: f.dueDay,
        discount: parseRupeesToPaise(f.discount || '0') ?? 0,
      });
      await refresh();
      toast(t('students.saved'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  });

  return (
    <Screen>
      <Text style={type.title}>{student.name}</Text>
      <Text style={[type.caption, { marginBottom: spacing.md }]}>{t('fees.planHint')}</Text>
      <FormInput
        control={control}
        name="monthlyFee"
        label={t('onboarding.monthlyFee')}
        keyboardType="decimal-pad"
      />
      <Text style={type.label}>{t('students.feeCycle')}</Text>
      <Controller
        control={control}
        name="feeCycle"
        render={({ field }) => (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            {CYCLES.map((c) => (
              <Chip
                key={c}
                label={t(`students.cycle.${c === 'one-time' ? 'oneTime' : c}`)}
                selected={field.value === c}
                onPress={() => field.onChange(c)}
              />
            ))}
          </View>
        )}
      />
      <Controller
        control={control}
        name="dueDay"
        render={({ field, fieldState }) => (
          <Input
            label={t('students.dueDay')}
            value={field.value ? String(field.value) : ''}
            onChangeText={(v) => field.onChange(Number(v.replace(/\D/g, '').slice(0, 2)))}
            keyboardType="number-pad"
            error={fieldState.error ? t('validation.dueDay') : undefined}
          />
        )}
      />
      <FormInput
        control={control}
        name="discount"
        label={t('fees.recurringDiscount')}
        keyboardType="decimal-pad"
      />
      <Button title={t('common.save')} onPress={submit} loading={busy} />
    </Screen>
  );
}
