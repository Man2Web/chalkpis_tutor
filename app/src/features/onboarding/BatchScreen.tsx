import { useIdempotencyKey } from '../../api/idempotency';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, toast } from '../../components';
import { reportError } from '../../lib/analytics';
import { api } from '../../api/client';
import type { OnboardingStackParams } from '../../navigation/types';
import { createBatch } from '../batches/api';
import { BatchFormFields, emptyBatchForm } from '../batches/BatchFormFields';
import { batchSchema, type BatchForm } from '../batches/schema';
import { useSession } from '../auth/session';
import { SetupLayout } from './SetupLayout';

export function BatchScreen({
  navigation,
}: NativeStackScreenProps<OnboardingStackParams, 'Batch'>) {
  const { t } = useTranslation();
  const idem = useIdempotencyKey();
  const instituteId = useSession((s) => s.profile?.instituteId);
  const { control, handleSubmit, formState } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    defaultValues: emptyBatchForm,
  });

  // Resume: if the first batch already exists (app was closed mid-wizard), go straight to students.
  useEffect(() => {
    if (!instituteId) return;
    api<{ batches: { id: string; defaultFee: number }[] }>('GET', '/batches?status=all')
      .then(({ batches }) => {
        const first = batches[0];
        if (first)
          navigation.replace('Students', {
            batchId: first.id,
            defaultFee: String(first.defaultFee / 100),
          });
      })
      .catch(reportError);
  }, [instituteId, navigation]);

  const submit = handleSubmit(async (values) => {
    if (!instituteId) return;
    try {
      const batchId = await createBatch(instituteId, values, { idempotencyKey: idem.key });
      idem.reset();
      navigation.replace('Students', { batchId, defaultFee: values.defaultFee });
    } catch (e) {
      idem.settle(e);
      reportError(e);
      toast(t('common.error'), 'error');
    }
  });

  return (
    <SetupLayout
      step="batch"
      title={t('onboarding.batchTitle')}
      subtitle={t('onboarding.batchHint')}
    >
      <BatchFormFields control={control} />
      <Button title={t('common.next')} onPress={submit} loading={formState.isSubmitting} />
    </SetupLayout>
  );
}
