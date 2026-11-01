import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  Chip,
  EmptyState,
  Input,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useBatches } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { addDays, todayYmd } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { DateStrip } from '../attendance/DateStrip';
import { useHomework, useHomeworkActions } from './api';
import { quickDueDays } from './logic';

/** New homework for a batch, or a piece of homework changed. A new one opens the list of who handed it in. */
export function HomeworkFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'HomeworkForm'>) {
  const { t } = useTranslation();
  const id = route.params?.id;
  const existing = useHomework(id);
  const batches = useBatches();
  const { create, update, remove } = useHomeworkActions();
  const active = useMemo(
    () => (batches.data ?? []).filter((b) => b.status === 'active'),
    [batches.data],
  );
  const today = todayYmd();

  const [batchId, setBatchId] = useState(route.params?.batchId ?? '');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [dueOn, setDueOn] = useState(addDays(today, 1));
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loaded = existing.data?.homework;
  useEffect(() => {
    if (!loaded) return;
    setBatchId(loaded.batchId);
    setTitle(loaded.title);
    setSubject(loaded.subject);
    setDetails(loaded.details);
    setDueOn(loaded.dueOn);
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
  if (id && !loaded)
    return (
      <Screen>
        <EmptyState title={t('homework.notFound')} />
      </Screen>
    );

  const setOn = loaded?.setOn ?? today;
  const errors = {
    batch: !batchId ? t('homework.pickBatch') : undefined,
    title: !title.trim() ? t('validation.required') : undefined,
    due: dueOn < setOn ? t('homework.dueBeforeSet') : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const save = async () => {
    setTried(true);
    if (!valid) return;
    const input = { title: title.trim(), subject: subject.trim(), details: details.trim(), dueOn };
    try {
      if (id) {
        await update.mutateAsync({ id, ...input });
        toast(t('homework.saved'), 'success');
        navigation.goBack();
      } else {
        const r = await create.mutateAsync({ batchId, ...input });
        toast(t('homework.saved'), 'success');
        navigation.replace('HomeworkCheck', { id: r.id });
      }
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    }
  };

  return (
    <Screen>
      {id ? null : (
        <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
          <Text style={type.fieldLabel}>{t('homework.batch')}</Text>
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
            <Text style={type.caption}>{t('homework.noBatches')}</Text>
          )}
          {tried && errors.batch ? (
            <Text style={[type.caption, { color: colors.danger }]}>{errors.batch}</Text>
          ) : null}
        </View>
      )}
      <Input
        label={t('homework.workTitle')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('homework.workPlaceholder')}
        maxLength={160}
        error={tried ? errors.title : undefined}
      />
      <Input
        label={t('homework.subject')}
        value={subject}
        onChangeText={setSubject}
        placeholder={t('homework.subjectPlaceholder')}
        maxLength={80}
      />
      <Input
        label={t('homework.details')}
        value={details}
        onChangeText={setDetails}
        placeholder={t('homework.detailsPlaceholder')}
        maxLength={2000}
        multiline
        numberOfLines={3}
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />
      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>{t('homework.dueOn')}</Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginBottom: spacing.sm,
        }}
      >
        {quickDueDays(today).map((q) => (
          <Chip
            key={q.key}
            label={t(`homework.quick.${q.key}`)}
            selected={dueOn === q.date}
            onPress={() => setDueOn(q.date)}
          />
        ))}
      </View>
      <View style={{ marginBottom: spacing.md, gap: spacing.xs }}>
        <DateStrip date={dueOn} onChange={setDueOn} allowFuture />
        {tried && errors.due ? (
          <Text style={[type.caption, { color: colors.danger }]}>{errors.due}</Text>
        ) : null}
      </View>
      <Button
        title={t(id ? 'common.save' : 'homework.setIt')}
        onPress={() => void save()}
        loading={create.isPending || update.isPending}
      />
      {id ? (
        <Button
          variant="ghost"
          title={t('homework.delete')}
          onPress={() => setConfirmDelete(true)}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}
      <BottomSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('homework.deleteTitle')}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={type.body}>{t('homework.deleteText')}</Text>
          <Button
            variant="danger"
            title={t('homework.delete')}
            loading={remove.isPending}
            onPress={() =>
              remove.mutate(id!, {
                onSuccess: () => {
                  setConfirmDelete(false);
                  toast(t('homework.deleted'), 'success');
                  // back to the list, past the ticks of the homework that is gone
                  navigation.popTo('Homework');
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
