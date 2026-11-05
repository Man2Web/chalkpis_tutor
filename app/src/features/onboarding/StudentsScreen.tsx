import { useIdempotencyKey } from '../../api/idempotency';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, FormInput, toast } from '../../components';
import { reportError, track } from '../../lib/analytics';
import { api } from '../../api/client';
import { refreshProfile } from '../auth/session';
import type { OnboardingStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { createStudent } from '../students/api';
import { SetupLayout } from './SetupLayout';
import { studentSchema, type StudentForm } from '../students/schema';

export function StudentsScreen({
  route,
}: NativeStackScreenProps<OnboardingStackParams, 'Students'>) {
  const { t } = useTranslation();
  const idem = useIdempotencyKey();
  const { batchId, defaultFee } = route.params;
  const { uid, profile } = useSession();
  const instituteId = profile?.instituteId;
  const [added, setAdded] = useState<string[]>([]);
  const [finishing, setFinishing] = useState(false);

  const blank: StudentForm = {
    name: '',
    phone: '',
    parentName: '',
    parentPhone: '',
    class: '',
    monthlyFee: defaultFee,
    feeCycle: 'monthly',
    dueDay: 1,
    notifyParent: true,
  };
  const { control, handleSubmit, reset, formState, watch } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    defaultValues: blank,
  });
  // a name typed but not yet added must not be lost when the owner taps Finish
  const typed = (watch('name') ?? '').trim().length > 0;

  const save = async (values: StudentForm) => {
    if (!instituteId) return false;
    try {
      await createStudent(instituteId, values, [batchId], undefined, {
        idempotencyKey: idem.key,
      });
      idem.reset();
      setAdded((a) => [...a, values.name.trim()]);
      reset(blank);
      return true;
    } catch (e) {
      idem.settle(e);
      reportError(e);
      toast(t('common.error'), 'error');
      return false;
    }
  };
  const add = handleSubmit(async (values) => {
    await save(values);
  });

  // Finishing (or skipping) marks onboarding done; the navigator then switches to the main app.
  const finish = async () => {
    if (!uid) return;
    setFinishing(true);
    try {
      await api('POST', '/me/onboarding-complete');
      await refreshProfile();
      track('onboarding_completed');
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setFinishing(false);
    }
  };

  // with a student typed in, Finish adds them first (a form error stops it, so nothing is lost)
  const addThenFinish = handleSubmit(async (values) => {
    if (await save(values)) await finish();
  });

  return (
    <SetupLayout
      step="students"
      title={t('onboarding.studentsTitle')}
      subtitle={t('onboarding.studentsHint')}
    >
      {added.length > 0 && (
        <Card style={{ marginBottom: spacing.lg, gap: spacing.xs }}>
          <Text style={type.label}>{t('onboarding.added', { count: added.length })}</Text>
          <Text style={type.caption}>{added.join(', ')}</Text>
        </Card>
      )}
      <FormInput control={control} name="name" label={t('onboarding.studentName')} maxLength={80} />
      <FormInput
        control={control}
        name="parentPhone"
        label={t('onboarding.parentPhone')}
        keyboardType="phone-pad"
        maxLength={16}
        prefix="+91"
        placeholder="98765 43210"
        autoComplete="tel"
      />
      <FormInput
        control={control}
        name="monthlyFee"
        label={t('onboarding.monthlyFee')}
        keyboardType="decimal-pad"
        prefix="₹"
      />
      <Button
        variant="secondary"
        title={t('onboarding.addStudent')}
        onPress={add}
        loading={formState.isSubmitting}
      />
      <View style={{ height: spacing.lg }} />
      <Button
        title={
          typed
            ? t('onboarding.addAndFinish')
            : added.length
              ? t('onboarding.finish')
              : t('common.skip')
        }
        variant={added.length || typed ? 'primary' : 'ghost'}
        onPress={typed ? addThenFinish : finish}
        loading={finishing || (typed && formState.isSubmitting)}
      />
    </SetupLayout>
  );
}
