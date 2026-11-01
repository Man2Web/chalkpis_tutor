import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { useBatches, useInstitute } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { open } from '../../lib/contact';
import { prettyDate, todayYmd } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { DateStrip } from '../attendance/DateStrip';
import { useCalendarActions, useCalendarEvent } from './api';
import { eventMessage, KINDS, type EventKind } from './logic';

/**
 * A holiday, exam day, event or parent meeting: on one day or several, for the whole centre or one batch. Once saved
 * it can be sent to parents on WhatsApp, to forward to the batch groups.
 */
export function EventFormScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'EventForm'>) {
  const { t } = useTranslation();
  const id = route.params?.id;
  const existing = useCalendarEvent(id);
  const batches = useBatches();
  const institute = useInstitute();
  const { create, update, remove } = useCalendarActions();
  const active = useMemo(
    () => (batches.data ?? []).filter((b) => b.status === 'active'),
    [batches.data],
  );

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('holiday');
  const [startsOn, setStartsOn] = useState(route.params?.date ?? todayYmd());
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [tried, setTried] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loaded = existing.data;
  useEffect(() => {
    if (!loaded) return;
    setTitle(loaded.title);
    setKind(loaded.kind);
    setStartsOn(loaded.startsOn);
    setEndsOn(loaded.endsOn !== loaded.startsOn ? loaded.endsOn : null);
    setBatchId(loaded.batchId);
    setNotes(loaded.notes);
  }, [loaded]);

  if (id && existing.isLoading)
    return (
      <Screen>
        <Skeleton height={300} />
      </Screen>
    );
  if (id && !loaded)
    return (
      <Screen>
        <EmptyState title={t('calendar.notFound')} />
      </Screen>
    );

  const titleError = !title.trim() ? t('validation.required') : undefined;
  const fail = (e: unknown) => {
    reportError(e);
    toast(t('common.error'), 'error');
  };
  const input = () => ({
    title: title.trim(),
    kind,
    startsOn,
    endsOn: endsOn ?? startsOn,
    batchId,
    notes: notes.trim(),
  });

  const save = async () => {
    setTried(true);
    if (titleError) return;
    try {
      if (id) {
        await update.mutateAsync({ id, ...input() });
        toast(t('calendar.saved'), 'success');
        navigation.goBack();
      } else {
        const r = await create.mutateAsync(input());
        toast(t('calendar.added'), 'success');
        // straight to the saved event, where it can be sent to parents
        navigation.replace('EventForm', { id: r.id });
      }
    } catch (e) {
      fail(e);
    }
  };

  const share = () => {
    const batchName = active.find((b) => b.id === batchId)?.name ?? null;
    const text = eventMessage(t, { ...input(), batchName }, institute.data?.name ?? '', (d) =>
      prettyDate(d, 'en-IN'),
    );
    void open(`https://wa.me/?text=${encodeURIComponent(text)}`);
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
      {id ? (
        <View
          style={{
            backgroundColor: colors.successSoft,
            borderRadius: 18,
            padding: spacing.lg,
            gap: spacing.sm,
            marginBottom: spacing.lg,
          }}
        >
          <Text style={[type.subhead, { color: colors.text }]}>{t('calendar.shareHint')}</Text>
          <Button
            variant="outline"
            title={t('calendar.shareParents')}
            icon={<Ionicons name="logo-whatsapp" size={16} color="#1DA851" />}
            onPress={share}
          />
        </View>
      ) : null}
      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>{t('calendar.kind')}</Text>
      {chipRow(
        KINDS.map((k) => (
          <Chip
            key={k}
            label={t(`calendar.kinds.${k}`)}
            selected={kind === k}
            onPress={() => setKind(k)}
          />
        )),
      )}
      <Input
        label={t('calendar.eventTitle')}
        value={title}
        onChangeText={setTitle}
        placeholder={t(`calendar.placeholders.${kind}`)}
        maxLength={120}
        error={tried ? titleError : undefined}
      />
      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>
        {t(endsOn ? 'calendar.from' : 'calendar.date')}
      </Text>
      <View style={{ marginBottom: spacing.md }}>
        <DateStrip
          date={startsOn}
          onChange={(d) => {
            setStartsOn(d);
            if (endsOn && endsOn < d) setEndsOn(d);
          }}
          allowFuture
        />
      </View>
      {chipRow(
        <>
          <Chip label={t('calendar.oneDay')} selected={!endsOn} onPress={() => setEndsOn(null)} />
          <Chip
            label={t('calendar.severalDays')}
            selected={!!endsOn}
            onPress={() => setEndsOn(endsOn ?? startsOn)}
          />
        </>,
      )}
      {endsOn ? (
        <>
          <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>{t('calendar.to')}</Text>
          <View style={{ marginBottom: spacing.md }}>
            <DateStrip
              date={endsOn}
              onChange={(d) => setEndsOn(d < startsOn ? startsOn : d)}
              allowFuture
            />
          </View>
        </>
      ) : null}
      <Text style={[type.fieldLabel, { marginBottom: spacing.xs }]}>{t('calendar.for')}</Text>
      {chipRow(
        <>
          <Chip
            label={t('calendar.wholeCentre')}
            selected={!batchId}
            onPress={() => setBatchId(null)}
          />
          {active.map((b) => (
            <Chip
              key={b.id}
              label={b.name}
              selected={batchId === b.id}
              onPress={() => setBatchId(b.id)}
            />
          ))}
        </>,
      )}
      <Input
        label={t('calendar.notes')}
        value={notes}
        onChangeText={setNotes}
        placeholder={t('calendar.notesPlaceholder')}
        maxLength={500}
        multiline
        numberOfLines={3}
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />
      <Button
        title={t(id ? 'common.save' : 'calendar.add')}
        onPress={() => void save()}
        loading={create.isPending || update.isPending}
      />
      {id ? (
        <Button
          variant="ghost"
          title={t('calendar.delete')}
          onPress={() => setDeleteOpen(true)}
          style={{ marginTop: spacing.sm }}
        />
      ) : null}

      <BottomSheet
        visible={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('calendar.deleteTitle')}
      >
        <View style={{ gap: spacing.md }}>
          <Text style={type.body}>{t('calendar.deleteText')}</Text>
          <Button
            variant="danger"
            title={t('calendar.delete')}
            loading={remove.isPending}
            onPress={() =>
              id &&
              remove.mutate(id, {
                onSuccess: () => {
                  setDeleteOpen(false);
                  navigation.goBack();
                },
                onError: fail,
              })
            }
          />
          <Button
            variant="secondary"
            title={t('common.cancel')}
            onPress={() => setDeleteOpen(false)}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
