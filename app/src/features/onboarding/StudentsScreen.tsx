import { useState } from 'react';
import { Text, View } from 'react-native';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { doc, updateDoc, serverTimestamp } from '@react-native-firebase/firestore';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, FormInput, Screen, toast } from '../../components';
import { reportError, track } from '../../lib/analytics';
import { db } from '../../lib/firebase';
import type { OnboardingStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { useSession } from '../auth/session';
import { createStudent } from '../students/api';
import { studentSchema, type StudentForm } from '../students/schema';

export function StudentsScreen({
  route,
}: NativeStackScreenProps<OnboardingStackParams, 'Students'>) {
  const { t } = useTranslation();
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
  const { control, handleSubmit, reset, formState } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    defaultValues: blank,
  });

  const add = handleSubmit(async (values) => {
    if (!instituteId) return;
    try {
      await createStudent(instituteId, values, [batchId]);
      setAdded((a) => [...a, values.name.trim()]);
      reset(blank);
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  });

  // Finishing (or skipping) marks onboarding done; the navigator then switches to the main app.
  const finish = async () => {
    if (!uid) return;
    setFinishing(true);
    try {
      await updateDoc(doc(db, 'users', uid), {
        onboardingDone: true,
        updatedAt: serverTimestamp(),
      });
      track('onboarding_completed');
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setFinishing(false);
    }
  };

  return (
    <Screen>
      <Text style={[type.title, { marginTop: spacing.lg }]}>{t('onboarding.studentsTitle')}</Text>
      <Text style={[type.caption, { marginBottom: spacing.lg }]}>
        {t('onboarding.studentsHint')}
      </Text>
      {added.length > 0 && (
        <Card style={{ marginBottom: spacing.lg, gap: spacing.xs }}>
          <Text style={type.label}>{t('onboarding.added', { count: added.length })}</Text>
          <Text style={type.caption}>{added.join(', ')}</Text>
        </Card>
      )}
      <FormInput control={control} name="name" label={t('onboarding.studentName')} />
      <FormInput
        control={control}
        name="parentPhone"
        label={t('onboarding.parentPhone')}
        keyboardType="phone-pad"
        maxLength={16}
      />
      <FormInput
        control={control}
        name="monthlyFee"
        label={t('onboarding.monthlyFee')}
        keyboardType="decimal-pad"
      />
      <Button
        variant="secondary"
        title={t('onboarding.addStudent')}
        onPress={add}
        loading={formState.isSubmitting}
      />
      <View style={{ height: spacing.lg }} />
      <Button
        title={added.length ? t('onboarding.finish') : t('common.skip')}
        variant={added.length ? 'primary' : 'ghost'}
        onPress={finish}
        loading={finishing}
      />
    </Screen>
  );
}
