import { useMemo, useState } from 'react';
import { Image, Switch, Text, View } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  Chip,
  EmptyState,
  FormInput,
  Input,
  Screen,
  Skeleton,
  toast,
  UpgradePrompt,
} from '../../components';
import { useAddGuard } from '../../data/guards';
import { useBatches, useInstituteId, useRefreshData, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { todayYmd, toYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { nationalNumber } from '../../lib/phone';
import type { FeeCycle } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { createStudent, setStudentStatus, updateStudent } from './api';
import { studentSchema, type StudentForm } from './schema';

const CYCLES: FeeCycle[] = ['monthly', 'quarterly', 'one-time'];
const cycleKey = (c: FeeCycle) => (c === 'one-time' ? 'oneTime' : c);

export function StudentFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'StudentForm'>) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const guard = useAddGuard();
  const students = useStudents();
  const batches = useBatches();
  const id = route.params?.id;
  const existing = useMemo(() => students.data?.find((s) => s.id === id), [students.data, id]);

  const [batchIds, setBatchIds] = useState<string[] | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string>();
  const [busy, setBusy] = useState(false);

  const defaults: StudentForm = useMemo(
    () =>
      existing
        ? {
            name: existing.name,
            phone: existing.phone ? nationalNumber(existing.phone) : '',
            parentName: existing.parentName,
            parentPhone: nationalNumber(existing.parentPhone),
            class: existing.class,
            monthlyFee: String(existing.monthlyFee / 100),
            feeCycle: existing.feeCycle,
            dueDay: existing.dueDay,
            notifyParent: existing.notifyParent,
            notes: existing.notes ?? '',
            joinedOn: toYmd(existing.joinedAt.toDate()),
          }
        : {
            name: '',
            phone: '',
            parentName: '',
            parentPhone: '',
            class: '',
            monthlyFee: '',
            feeCycle: 'monthly',
            dueDay: 1,
            notifyParent: true,
            notes: '',
            joinedOn: todayYmd(),
          },
    [existing],
  );
  const { control, handleSubmit, setValue, getValues, formState } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    values: defaults,
  });

  if (id && students.isLoading)
    return (
      <Screen>
        <Skeleton height={48} />
      </Screen>
    );
  if (id && !existing)
    return (
      <Screen>
        <EmptyState title={t('students.notFound')} />
      </Screen>
    );

  const selected =
    batchIds ?? existing?.batchIds ?? (route.params?.batchId ? [route.params.batchId] : []);
  const activeBatches = (batches.data ?? []).filter(
    (b) => b.status === 'active' || selected.includes(b.id),
  );

  const toggleBatch = (bid: string) => {
    const next = selected.includes(bid) ? selected.filter((x) => x !== bid) : [...selected, bid];
    setBatchIds(next);
    // New student: pre-fill the fee from the first chosen batch.
    if (!existing && next.length && !getValues('monthlyFee')) {
      const b = batches.data?.find((x) => x.id === next[0]);
      if (b) setValue('monthlyFee', String(b.defaultFee / 100));
    }
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!res.canceled) setPhotoUri(res.assets[0].uri);
  };

  const submit = handleSubmit(async (values) => {
    if (!existing && !guard.check('student')) return;
    setBusy(true);
    try {
      if (existing)
        await updateStudent(
          instituteId,
          existing.id,
          values,
          { batchIds: existing.batchIds, status: existing.status },
          selected,
          photoUri,
        );
      else await createStudent(instituteId, values, selected, photoUri);
      await refresh();
      toast(t(existing ? 'students.saved' : 'students.added'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  });

  const toggleStatus = async () => {
    if (!existing) return;
    const next = existing.status === 'active' ? 'inactive' : 'active';
    if (next === 'active' && !guard.check('student')) return;
    setBusy(true);
    try {
      await setStudentStatus(instituteId, existing.id, existing.batchIds, next);
      await refresh();
      toast(t(next === 'active' ? 'students.reactivated' : 'students.deactivated'), 'success');
      navigation.goBack();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
      setBusy(false);
    }
  };

  const photo = photoUri ?? existing?.photoUrl;

  return (
    <Screen>
      <FormInput control={control} name="name" label={t('students.name')} autoComplete="name" />
      <FormInput
        control={control}
        name="phone"
        label={t('students.phone')}
        keyboardType="phone-pad"
        maxLength={16}
      />
      <FormInput control={control} name="parentName" label={t('students.parentName')} />
      <FormInput
        control={control}
        name="parentPhone"
        label={t('students.parentPhone')}
        keyboardType="phone-pad"
        maxLength={16}
      />
      <FormInput control={control} name="class" label={t('onboarding.class')} />

      <Text style={type.label}>{t('students.batches')}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.md,
        }}
      >
        {activeBatches.length === 0 ? (
          <Text style={type.caption}>{t('students.noBatchesYet')}</Text>
        ) : null}
        {activeBatches.map((b) => (
          <Chip
            key={b.id}
            label={b.name}
            selected={selected.includes(b.id)}
            onPress={() => toggleBatch(b.id)}
          />
        ))}
      </View>

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
                label={t(`students.cycle.${cycleKey(c)}`)}
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
        name="joinedOn"
        label={t('students.joinedOn')}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
      />
      <Controller
        control={control}
        name="notifyParent"
        render={({ field }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 48,
              marginBottom: spacing.md,
            }}
          >
            <Text style={[type.label, { flex: 1 }]}>{t('students.notifyParent')}</Text>
            <Switch
              value={field.value}
              onValueChange={field.onChange}
              accessibilityLabel={t('students.notifyParent')}
            />
          </View>
        )}
      />
      <FormInput
        control={control}
        name="notes"
        label={t('students.notes')}
        multiline
        numberOfLines={3}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          marginBottom: spacing.lg,
        }}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: 64, height: 64, borderRadius: 32 }} />
        ) : null}
        <Button
          variant="secondary"
          title={photo ? t('students.changePhoto') : t('students.addPhoto')}
          onPress={pickPhoto}
        />
      </View>

      {existing ? (
        <Text style={type.caption}>
          {t('students.feeNow', { fee: formatINR(existing.monthlyFee) })}
        </Text>
      ) : null}
      <Button title={t('common.save')} onPress={submit} loading={busy || formState.isSubmitting} />
      {existing ? (
        <Button
          variant={existing.status === 'active' ? 'danger' : 'secondary'}
          title={t(existing.status === 'active' ? 'students.deactivate' : 'students.reactivate')}
          onPress={toggleStatus}
          disabled={busy}
        />
      ) : null}
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'student'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </Screen>
  );
}
