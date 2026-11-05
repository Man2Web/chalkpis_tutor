import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Chip,
  DateField,
  EmptyState,
  Input,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useBatches } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { useCategory } from '../../lib/category';
import { todayYmd } from '../../lib/dates';
import { normalizeIndianPhone } from '../../lib/phone';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useEnquiry, useEnquiryActions } from './api';
import { quickFollowUps, SOURCES, type Source } from './logic';

/** A new enquiry (a walk-in, a call, a message), or one being corrected. */
export function EnquiryFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'EnquiryForm'>) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const id = route.params?.id;
  const existing = useEnquiry(id);
  const batches = useBatches();
  const { create, update } = useEnquiryActions();
  const active = useMemo(
    () => (batches.data ?? []).filter((b) => b.status === 'active'),
    [batches.data],
  );
  const today = todayYmd();

  const [name, setName] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [level, setLevel] = useState('');
  const [interest, setInterest] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [source, setSource] = useState<Source>('walk_in');
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  const loaded = existing.data?.enquiry;
  useEffect(() => {
    if (!loaded) return;
    setName(loaded.name);
    setParentName(loaded.parentName);
    setPhone(loaded.phone.replace(/^\+91/, ''));
    setLevel(loaded.class);
    setInterest(loaded.interest);
    setBatchId(loaded.batchId);
    setSource(loaded.source);
    setFollowUp(loaded.nextFollowUp);
  }, [loaded]);

  if (id && existing.isLoading)
    return (
      <Screen>
        <Skeleton height={300} />
      </Screen>
    );
  // a failed load is not a deleted enquiry: offer to try again
  if (id && existing.isError && !loaded)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void existing.refetch()}
        />
      </Screen>
    );
  if (id && !loaded)
    return (
      <Screen>
        <EmptyState title={t('enquiries.notFound')} />
      </Screen>
    );

  const errors = {
    name: !name.trim() ? t('validation.required') : undefined,
    phone: !normalizeIndianPhone(phone) ? t('validation.phone') : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const save = async () => {
    setTried(true);
    if (!valid) return;
    const input = {
      name: name.trim(),
      parentName: parentName.trim(),
      phone,
      class: level.trim(),
      interest: interest.trim(),
      batchId,
      source,
      nextFollowUp: followUp,
    };
    try {
      if (id) {
        await update.mutateAsync({ id, ...input });
        toast(t('enquiries.saved'), 'success');
        navigation.goBack();
      } else {
        const r = await create.mutateAsync({ ...input, note: note.trim() });
        toast(t('enquiries.saved'), 'success');
        navigation.replace('Enquiry', { id: r.id });
      }
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  };

  const chipRow = (children: React.ReactNode) => (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}
    >
      {children}
    </View>
  );

  return (
    <Screen>
      <Input
        label={t('enquiries.childName')}
        value={name}
        onChangeText={setName}
        placeholder={t('enquiries.childPlaceholder')}
        maxLength={80}
        error={tried ? errors.name : undefined}
      />
      <Input
        label={t('enquiries.parentName')}
        value={parentName}
        onChangeText={setParentName}
        maxLength={80}
      />
      <Input
        label={t('enquiries.phone')}
        value={phone}
        onChangeText={setPhone}
        prefix="+91"
        keyboardType="phone-pad"
        maxLength={14}
        error={tried ? errors.phone : undefined}
      />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input label={ct('level')} value={level} onChangeText={setLevel} maxLength={30} />
        </View>
        <View style={{ flex: 2 }}>
          <Input
            label={t('enquiries.interest')}
            value={interest}
            onChangeText={setInterest}
            placeholder={t('enquiries.interestPlaceholder')}
            maxLength={120}
          />
        </View>
      </View>
      {active.length ? (
        <>
          <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>
            {t('enquiries.batch')}
          </Text>
          {chipRow(
            active.map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                selected={batchId === b.id}
                onPress={() => setBatchId(batchId === b.id ? null : b.id)}
              />
            )),
          )}
        </>
      ) : null}
      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>{t('enquiries.source')}</Text>
      {chipRow(
        SOURCES.map((s) => (
          <Chip
            key={s}
            label={t(`enquiries.sources.${s}`)}
            selected={source === s}
            onPress={() => setSource(s)}
          />
        )),
      )}
      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>
        {t('enquiries.nextFollowUp')}
      </Text>
      {chipRow(
        <>
          {quickFollowUps(today).map((q) => (
            <Chip
              key={q.key}
              label={t(`enquiries.quick.${q.key}`)}
              selected={followUp === q.date}
              onPress={() => setFollowUp(q.date)}
            />
          ))}
          <Chip
            label={t('enquiries.noFollowUp')}
            selected={!followUp}
            onPress={() => setFollowUp(null)}
          />
        </>,
      )}
      <DateField
        label={t('enquiries.followUpDate')}
        value={followUp ?? ''}
        onChange={(d) => setFollowUp(d || null)}
        minDate={today}
        clearable
      />
      {id ? null : (
        <Input
          label={t('enquiries.firstNote')}
          value={note}
          onChangeText={setNote}
          placeholder={t('enquiries.notePlaceholder')}
          maxLength={1000}
          multiline
          numberOfLines={3}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
        />
      )}
      <Button
        title={t(id ? 'common.save' : 'enquiries.add')}
        onPress={() => void save()}
        loading={create.isPending || update.isPending}
      />
      <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>
        {t('enquiries.privacyHint')}
      </Text>
    </Screen>
  );
}
