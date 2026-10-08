import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, getDocs, limit, query } from '@react-native-firebase/firestore';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Chip, FormInput, Screen, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { db } from '../../lib/firebase';
import { WEEKDAYS } from '../../lib/types';
import type { OnboardingStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { createBatch } from '../batches/api';
import { batchSchema, type BatchForm } from '../batches/schema';
import { useSession } from '../auth/session';

export function BatchScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Batch'>) {
  const { t } = useTranslation();
  const instituteId = useSession((s) => s.profile?.instituteId);
  const { control, handleSubmit, formState } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: {
      name: '',
      subject: '',
      class: '',
      days: [],
      startTime: '17:00',
      endTime: '18:00',
      defaultFee: '',
    },
  });

  // Resume: if the first batch already exists (app was closed mid-wizard), go straight to students.
  useEffect(() => {
    if (!instituteId) return;
    getDocs(query(collection(db, 'institutes', instituteId, 'batches'), limit(1)))
      .then((snap) => {
        const first = snap.docs[0];
        if (first)
          navigation.replace('Students', {
            batchId: first.id,
            defaultFee: String((first.data().defaultFee ?? 0) / 100),
          });
      })
      .catch(reportError);
  }, [instituteId, navigation]);

  const submit = handleSubmit(async (values) => {
    if (!instituteId) return;
    try {
      const batchId = await createBatch(instituteId, values);
      navigation.navigate('Students', { batchId, defaultFee: values.defaultFee });
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  });

  return (
    <Screen>
      <Text style={[type.title, { marginVertical: spacing.lg }]}>{t('onboarding.batchTitle')}</Text>
      <FormInput control={control} name="name" label={t('onboarding.batchName')} />
      <FormInput control={control} name="subject" label={t('onboarding.subject')} />
      <FormInput control={control} name="class" label={t('onboarding.class')} />
      <Text style={type.label}>{t('onboarding.days')}</Text>
      <Controller
        control={control}
        name="days"
        render={({ field, fieldState }) => (
          <View style={{ marginBottom: spacing.md, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {WEEKDAYS.map((d) => {
                const on = field.value.includes(d);
                return (
                  <Chip
                    key={d}
                    label={t(`days.${d}`)}
                    selected={on}
                    onPress={() =>
                      field.onChange(on ? field.value.filter((x) => x !== d) : [...field.value, d])
                    }
                  />
                );
              })}
            </View>
            {fieldState.error ? (
              <Text style={[type.caption, { color: colors.danger }]}>{t('validation.days')}</Text>
            ) : null}
          </View>
        )}
      />
      <FormInput
        control={control}
        name="startTime"
        label={t('onboarding.startTime')}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <FormInput
        control={control}
        name="endTime"
        label={t('onboarding.endTime')}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <FormInput
        control={control}
        name="defaultFee"
        label={t('onboarding.defaultFee')}
        keyboardType="decimal-pad"
      />
      <Button title={t('common.next')} onPress={submit} loading={formState.isSubmitting} />
    </Screen>
  );
}
