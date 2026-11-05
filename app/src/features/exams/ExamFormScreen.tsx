import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
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
import { todayYmd } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { useExam, useExamActions } from './api';
import { marksText } from './logic';

const NUMBER = /^\d+([.,]\d{1,2})?$/;

/** A new test for a batch, or a test's details changed. Saving a new test goes straight to entering marks. */
export function ExamFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'ExamForm'>) {
  const { t } = useTranslation();
  const id = route.params?.id;
  const existing = useExam(id);
  const batches = useBatches();
  const { create, update, remove } = useExamActions();
  const active = useMemo(
    () => (batches.data ?? []).filter((b) => b.status === 'active'),
    [batches.data],
  );

  const [batchId, setBatchId] = useState(route.params?.batchId ?? '');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(todayYmd());
  const [maxMarks, setMaxMarks] = useState('');
  const [passPercent, setPassPercent] = useState('35');
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // fill the form once the test being edited has loaded
  const loaded = existing.data?.exam;
  useEffect(() => {
    if (!loaded) return;
    setBatchId(loaded.batchId);
    setName(loaded.name);
    setSubject(loaded.subject);
    setDate(loaded.date);
    setMaxMarks(marksText(loaded.maxMarks));
    setPassPercent(String(loaded.passPercent));
  }, [loaded]);
  const pickBatch = (bid: string) => {
    setBatchId(bid);
    const b = active.find((x) => x.id === bid);
    if (b && !subject) setSubject(b.subject);
  };
  // a single batch needs no choosing; a picked batch suggests its subject
  useEffect(() => {
    if (!id && !batchId && active.length === 1) pickBatch(active[0]!.id);
  }, [id, batchId, active]);

  if (id && existing.isLoading)
    return (
      <Screen>
        <Skeleton height={240} />
      </Screen>
    );
  // a failed load is not a deleted test: offer to try again
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
        <EmptyState title={t('exams.notFound')} />
      </Screen>
    );

  const max = Number(maxMarks.replace(',', '.'));
  const errors = {
    batch: !batchId ? t('exams.pickBatch') : undefined,
    name: !name.trim() ? t('validation.required') : undefined,
    max:
      !NUMBER.test(maxMarks.trim()) || max <= 0 || max > 10000 ? t('validation.marks') : undefined,
    pass:
      !/^\d{1,3}$/.test(passPercent.trim()) || Number(passPercent) > 100
        ? t('validation.percent')
        : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const save = async () => {
    setTried(true);
    if (!valid) return;
    const input = {
      name: name.trim(),
      subject: subject.trim(),
      date,
      maxMarks: max,
      passPercent: Number(passPercent),
    };
    try {
      if (id) {
        await update.mutateAsync({ id, ...input });
        toast(t('exams.saved'), 'success');
        navigation.goBack();
      } else {
        const r = await create.mutateAsync({ batchId, ...input });
        navigation.replace('ExamMarks', { id: r.id });
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'marks_over_max') toast(t('exams.maxBelowMarks'), 'error');
      else {
        reportError(e);
        toast(t('common.error'), 'error');
      }
    }
  };

  return (
    <Screen>
      {id ? null : (
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Text style={type.fieldLabel}>{t('exams.batch')}</Text>
          {active.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {active.map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  selected={batchId === b.id}
                  onPress={() => pickBatch(b.id)}
                />
              ))}
            </View>
          ) : (
            <Text style={type.caption}>{t('exams.noBatches')}</Text>
          )}
          {tried && errors.batch ? (
            <Text style={[type.caption, { color: colors.danger }]}>{errors.batch}</Text>
          ) : null}
        </View>
      )}
      <Input
        label={t('exams.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('exams.namePlaceholder')}
        maxLength={120}
        error={tried ? errors.name : undefined}
      />
      <Input
        label={t('exams.subject')}
        value={subject}
        onChangeText={setSubject}
        placeholder={t('exams.subjectPlaceholder')}
        maxLength={80}
      />
      {/* any day: a test is often set up ahead of the day it is written */}
      <DateField label={t('exams.date')} value={date} onChange={setDate} />
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Input
            label={t('exams.maxMarks')}
            value={maxMarks}
            onChangeText={setMaxMarks}
            placeholder="50"
            keyboardType="decimal-pad"
            maxLength={8}
            error={tried ? errors.max : undefined}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            label={t('exams.passPercent')}
            value={passPercent}
            onChangeText={setPassPercent}
            keyboardType="number-pad"
            maxLength={3}
            hint={t('exams.passHint')}
            error={tried ? errors.pass : undefined}
          />
        </View>
      </View>
      <Button
        title={t(id ? 'common.save' : 'exams.createAndEnter')}
        onPress={() => void save()}
        loading={create.isPending || update.isPending}
      />
      {id ? (
        <Button
          variant="ghost"
          title={t('exams.delete')}
          onPress={() => setConfirmDelete(true)}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
      <BottomSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('exams.deleteTitle')}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={type.body}>{t('exams.deleteText')}</Text>
          <Button
            variant="danger"
            title={t('exams.delete')}
            loading={remove.isPending}
            onPress={() =>
              remove.mutate(id!, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  toast(t('exams.deleted'), 'success');
                  // back to the list of tests, past the marks of the test that is gone
                  navigation.popTo('Exams');
                },
                onError: (e) => {
                  reportError(e);
                  toast(t('common.error'), 'error');
                },
              })
            }
          />
          <Button
            variant="secondary"
            title={t('common.cancel')}
            onPress={() => setConfirmDelete(false)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
