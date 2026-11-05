import { useIdempotencyKey } from '../../api/idempotency';
import { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Switch } from 'panelui-native/components/switch';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { useCategory } from '../../lib/category';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Button,
  Chip,
  ConfirmSheet,
  EmptyState,
  FormDateField,
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
import { formatINR, parseRupeesToPaise } from '../../lib/money';
import { nationalNumber, normalizeIndianPhone } from '../../lib/phone';
import type { FeeCycle } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { colors, radius, spacing, type } from '../../theme';
import { createStudent, linkSibling, setStudentStatus, updateStudent } from './api';
import { siblingSuggestions } from './family';
import { studentSchema, type StudentForm } from './schema';

const CYCLES: FeeCycle[] = ['monthly', 'quarterly', 'one-time'];
const cycleKey = (c: FeeCycle) => (c === 'one-time' ? 'oneTime' : c);
/** The saved fee under the Save button, in the words of its cycle ("Current one-time fee: ₹500"). */
const FEE_NOW: Record<FeeCycle, string> = {
  monthly: 'students.feeNow',
  quarterly: 'students.feeNowQuarterly',
  'one-time': 'students.feeNowOneTime',
  yearly: 'students.feeNowYearly',
};

export function StudentFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'StudentForm'>) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const idem = useIdempotencyKey();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const guard = useAddGuard();
  const students = useStudents();
  const batches = useBatches();
  const id = route.params?.id;
  const existing = useMemo(() => students.data?.find((s) => s.id === id), [students.data, id]);
  // "Add a brother or sister" from a profile: the parent is the same, so it starts filled in
  const siblingOf = route.params?.siblingOf;
  const sibling = useMemo(
    () => (siblingOf ? students.data?.find((s) => s.id === siblingOf) : undefined),
    [students.data, siblingOf],
  );
  // a brother or sister the owner confirmed from the hint below the parent's number
  const [linkWith, setLinkWith] = useState<string | null>(null);
  const [notSiblings, setNotSiblings] = useState<string[]>([]);

  const [batchIds, setBatchIds] = useState<string[] | undefined>(undefined);
  const [photoUri, setPhotoUri] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  // Opened for a batch (the getting-started card, a batch's "Add a new student"): its fee is the starting fee.
  const startBatch = route.params?.batchId
    ? batches.data?.find((b) => b.id === route.params?.batchId)
    : undefined;

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
            dob: existing.dob ?? '',
            gender: existing.gender ?? '',
            joinedOn: toYmd(existing.joinedAt.toDate()),
          }
        : {
            name: '',
            phone: '',
            parentName: sibling?.parentName ?? '',
            parentPhone: sibling ? nationalNumber(sibling.parentPhone) : '',
            class: '',
            monthlyFee: startBatch ? String(startBatch.defaultFee / 100) : '',
            feeCycle: 'monthly',
            dueDay: 1,
            notifyParent: sibling?.notifyParent ?? true,
            notes: '',
            dob: '',
            gender: '',
            joinedOn: todayYmd(),
          },
    [existing, sibling, startBatch],
  );
  const { control, handleSubmit, setValue, getValues, formState, watch } = useForm<StudentForm>({
    resolver: zodResolver(studentSchema),
    values: defaults,
    // data that arrives late (the batch's fee, a refetch) must not wipe what was already typed
    resetOptions: { keepDirtyValues: true },
  });

  if (id && students.isLoading)
    return (
      <Screen>
        <Skeleton height={48} />
      </Screen>
    );
  // a failed load with nothing cached is not "not found": offer to try again
  if (id && students.isError && !students.data)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void students.refetch()}
        />
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
      if (b) setValue('monthlyFee', String(b.defaultFee / 100), { shouldDirty: true });
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
      if (existing) {
        await updateStudent(
          instituteId,
          existing.id,
          values,
          { batchIds: existing.batchIds, status: existing.status },
          selected,
          photoUri,
        );
        if (linkWith) await linkSibling(existing.id, linkWith);
      } else {
        await createStudent(
          instituteId,
          values,
          selected,
          photoUri,
          { idempotencyKey: idem.key },
          (linkWith ?? sibling?.id) || undefined,
        );
        idem.reset();
      }
      // the lists refresh behind us; waiting for every refetch kept the spinner going for seconds
      void refresh();
      toast(t(existing ? 'students.saved' : 'students.added'), 'success');
      navigation.goBack();
    } catch (e) {
      idem.settle(e);
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
      setConfirmDeactivate(false);
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
  const cycle = watch('feeCycle');
  // quarterly bills three months' fee at once: say how much, so the owner is not surprised
  const quarterPaise = parseRupeesToPaise(watch('monthlyFee') ?? '');
  const quarterTotal = quarterPaise ? quarterPaise * 3 : 0;
  const all = students.data ?? [];
  const chosen = linkWith ? all.find((s) => s.id === linkWith) : undefined;
  const suggestions = sibling
    ? []
    : siblingSuggestions(all, normalizeIndianPhone(watch('parentPhone') ?? ''), existing).filter(
        (s) => !notSiblings.includes(s.id),
      );
  const levelOf = (s: { class: string }) =>
    s.class ? ` (${ct('levelValue', { n: s.class })})` : '';
  const familyNote = (text: string, actions?: React.ReactNode) => (
    <View
      style={{
        backgroundColor: colors.infoSoft,
        borderRadius: radius.lg,
        padding: spacing.md,
        gap: spacing.sm,
        marginBottom: spacing.md,
      }}
    >
      <Text style={[type.subhead, { color: colors.text }]}>{text}</Text>
      {actions ? <View style={{ flexDirection: 'row', gap: spacing.sm }}>{actions}</View> : null}
    </View>
  );

  return (
    <Screen>
      <FormInput
        control={control}
        name="name"
        label={t('students.name')}
        autoComplete="name"
        maxLength={80}
      />
      <FormInput
        control={control}
        name="phone"
        label={t('students.phone')}
        keyboardType="phone-pad"
        prefix="+91"
        placeholder="98765 43210"
        maxLength={16}
      />
      <FormInput
        control={control}
        name="parentName"
        label={t('students.parentName')}
        maxLength={80}
      />
      <FormInput
        control={control}
        name="parentPhone"
        label={t('students.parentPhone')}
        keyboardType="phone-pad"
        prefix="+91"
        placeholder="98765 43210"
        maxLength={16}
      />
      {sibling
        ? familyNote(t('family.addingFor', { name: sibling.name }))
        : chosen
          ? familyNote(
              t('family.willLink', { name: chosen.name }),
              <Button
                size="small"
                variant="secondary"
                title={t('family.undo')}
                onPress={() => setLinkWith(null)}
              />,
            )
          : suggestions.map((s) => (
              <View key={s.id}>
                {familyNote(
                  t('family.hint', { name: s.name, level: levelOf(s) }),
                  <>
                    <Button
                      size="small"
                      title={t('family.yes')}
                      onPress={() => {
                        setLinkWith(s.id);
                        if (!getValues('parentName').trim() && s.parentName)
                          setValue('parentName', s.parentName);
                      }}
                    />
                    <Button
                      size="small"
                      variant="secondary"
                      title={t('family.no')}
                      onPress={() => setNotSiblings((n) => [...n, s.id])}
                    />
                  </>,
                )}
              </View>
            ))}
      <FormInput
        control={control}
        name="class"
        label={ct('level')}
        placeholder={ct('levelHint')}
        maxLength={30}
      />

      <Text style={type.fieldLabel}>{t('students.batches')}</Text>
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
        label={t(`students.feeLabel.${cycleKey(cycle)}`)}
        hint={
          cycle === 'quarterly'
            ? quarterTotal
              ? t('students.quarterlyHintAmount', { amount: formatINR(quarterTotal) })
              : t('students.quarterlyHint')
            : undefined
        }
        prefix="₹"
        keyboardType="decimal-pad"
      />
      <Text style={type.fieldLabel}>{t('students.feeCycle')}</Text>
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
            {(existing?.feeCycle === 'yearly' ? [...CYCLES, 'yearly' as const] : CYCLES).map(
              (c) => (
                <Chip
                  key={c}
                  label={t(`students.cycle.${cycleKey(c)}`)}
                  selected={field.value === c}
                  onPress={() => field.onChange(c)}
                />
              ),
            )}
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
      <FormDateField
        control={control}
        name="joinedOn"
        label={t('students.joinedOn')}
        maxDate={todayYmd()}
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
            {/* the same switch as every other on/off in the app */}
            <Switch
              value={field.value}
              onValueChange={field.onChange}
              accessibilityLabel={t('students.notifyParent')}
            />
          </View>
        )}
      />
      <FormDateField
        control={control}
        name="dob"
        label={t('students.dob')}
        maxDate={todayYmd()}
        birthday
        clearable
      />
      <Text style={type.fieldLabel}>{t('students.gender')}</Text>
      <Controller
        control={control}
        name="gender"
        render={({ field }) => (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            {(['male', 'female', 'other'] as const).map((g) => (
              <Chip
                key={g}
                label={t(`students.genders.${g}`)}
                selected={field.value === g}
                onPress={() => field.onChange(field.value === g ? '' : g)}
              />
            ))}
          </View>
        )}
      />
      <FormInput
        control={control}
        name="notes"
        label={t('students.notes')}
        maxLength={500}
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
          {t(FEE_NOW[existing.feeCycle], { fee: formatINR(existing.monthlyFee) })}
        </Text>
      ) : null}
      <Button title={t('common.save')} onPress={submit} loading={busy || formState.isSubmitting} />
      {existing ? (
        <Button
          variant={existing.status === 'active' ? 'danger' : 'secondary'}
          title={t(existing.status === 'active' ? 'students.deactivate' : 'students.reactivate')}
          // deactivating takes them off rosters and stops new fees, so ask first; reactivating is harmless
          onPress={existing.status === 'active' ? () => setConfirmDeactivate(true) : toggleStatus}
          disabled={busy}
        />
      ) : null}
      {existing ? (
        <ConfirmSheet
          visible={confirmDeactivate}
          onClose={() => setConfirmDeactivate(false)}
          title={t('students.deactivateTitle', { name: existing.name })}
          message={t('students.deactivateText', { name: existing.name })}
          confirmLabel={t('students.deactivateConfirm')}
          onConfirm={toggleStatus}
          loading={busy}
          destructive
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
