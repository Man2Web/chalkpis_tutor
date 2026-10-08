import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Screen, Skeleton, toast, UpgradePrompt } from '../../components';
import { useAddGuard } from '../../data/guards';
import { useBatches, useInstituteId, useRefreshData } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import type { MainStackParams } from '../../navigation/types';
import { createBatch, updateBatch } from './api';
import { BatchFormFields, emptyBatchForm } from './BatchFormFields';
import { batchSchema, type BatchForm } from './schema';

export function BatchFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'BatchForm'>) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const guard = useAddGuard();
  const batches = useBatches();
  const id = route.params?.id;
  const existing = useMemo(() => batches.data?.find((b) => b.id === id), [batches.data, id]);
  const [busy, setBusy] = useState(false);

  const values: BatchForm = useMemo(
    () =>
      existing
        ? {
            name: existing.name,
            subject: existing.subject,
            class: existing.class,
            days: existing.days,
            startTime: existing.startTime,
            endTime: existing.endTime,
            defaultFee: String(existing.defaultFee / 100),
          }
        : emptyBatchForm,
    [existing],
  );
  const { control, handleSubmit } = useForm<BatchForm>({
    resolver: zodResolver(batchSchema),
    values,
  });

  if (id && batches.isLoading)
    return (
      <Screen>
        <Skeleton height={48} />
      </Screen>
    );
  if (id && !existing)
    return (
      <Screen>
        <EmptyState title={t('batches.notFound')} />
      </Screen>
    );

  const submit = handleSubmit(async (form) => {
    if (!existing && !guard.check('batch')) return;
    setBusy(true);
    try {
      if (existing) await updateBatch(instituteId, existing.id, form);
      else await createBatch(instituteId, form);
      await refresh();
      toast(t('batches.saved'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  });

  return (
    <Screen>
      <BatchFormFields control={control} />
      <Button title={t('common.save')} onPress={submit} loading={busy} />
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'batch'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </Screen>
  );
}
