import { useEffect } from 'react';
import { Text } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { collection, getDocs, limit, query } from '@react-native-firebase/firestore';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Screen, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { db } from '../../lib/firebase';
import type { OnboardingStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { createBatch } from '../batches/api';
import { BatchFormFields, emptyBatchForm } from '../batches/BatchFormFields';
import { batchSchema, type BatchForm } from '../batches/schema';
import { useSession } from '../auth/session';

export function BatchScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Batch'>) {
  const { t } = useTranslation();
  const instituteId = useSession((s) => s.profile?.instituteId);
  const { control, handleSubmit, formState } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: emptyBatchForm,
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
      <BatchFormFields control={control} />
      <Button title={t('common.next')} onPress={submit} loading={formState.isSubmitting} />
    </Screen>
  );
}
