import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useCategory } from '../../lib/category';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  EmptyState,
  ListItem,
  SearchField,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useBatches, useInstituteId, useRefreshData, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { todayYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import type { Student } from '../../lib/types';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { addStudentsToBatch, removeStudentFromBatch } from '../students/api';
import { filterStudents } from '../students/logic';
import { PickRow } from '../students/PickRow';
import { AttendanceSummary } from '../attendance/AttendanceSummary';
import { setBatchStatus } from './api';
import { scheduleLabel } from './format';

export function BatchDetailScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'BatchDetail'>) {
  const { t } = useTranslation();
  const { ct } = useCategory();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const batches = useBatches();
  const students = useStudents();
  const batch = batches.data?.find((b) => b.id === route.params.id);

  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [removing, setRemoving] = useState<Student | null>(null);

  const roster = useMemo(
    () =>
      (students.data ?? []).filter(
        (s) => s.status === 'active' && s.batchIds.includes(route.params.id),
      ),
    [students.data, route.params.id],
  );
  const others = useMemo(
    () =>
      (students.data ?? []).filter(
        (s) => s.status === 'active' && !s.batchIds.includes(route.params.id),
      ),
    [students.data, route.params.id],
  );
  const candidates = useMemo(() => filterStudents(others, { search }), [others, search]);

  if (batches.isLoading)
    return (
      <Screen>
        <Skeleton height={80} />
      </Screen>
    );
  // a failed load with nothing cached is not "not found": offer to try again
  if (batches.isError && !batches.data)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void batches.refetch()}
        />
      </Screen>
    );
  if (!batch)
    return (
      <Screen>
        <EmptyState title={t('batches.notFound')} />
      </Screen>
    );

  const guarded = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      // waited for here: the roster below must show the change before the sheet's spinner stops
      await refresh();
    } catch (e) {
      reportError(e);
      toast(t('common.error'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const addPicked = () =>
    guarded(async () => {
      await addStudentsToBatch(instituteId, batch.id, picked);
      setPicked([]);
      setSheet(false);
    });

  const archive = () =>
    guarded(async () => {
      await setBatchStatus(
        instituteId,
        batch.id,
        batch.status === 'active' ? 'archived' : 'active',
      );
      setConfirmArchive(false);
      toast(
        t(batch.status === 'active' ? 'batches.archivedToast' : 'batches.restoredToast'),
        'success',
      );
      navigation.goBack();
    });

  const remove = () =>
    guarded(async () => {
      if (!removing) return;
      await removeStudentFromBatch(instituteId, batch.id, removing.id);
      setRemoving(null);
    });

  const addNewStudent = () => {
    setSheet(false);
    navigation.navigate('StudentForm', { batchId: batch.id });
  };
  const active = batch.status === 'active';

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={students.isLoading ? [] : roster}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={type.title}>{batch.name}</Text>
            <Card style={{ gap: spacing.xs }}>
              <Text style={type.body}>
                {batch.subject}
                {batch.class ? ` • ${ct('levelValue', { n: batch.class })}` : ''}
              </Text>
              <Text style={type.caption}>{scheduleLabel(batch, t)}</Text>
              <Text style={type.caption}>
                {t('batches.defaultFeeIs', { fee: formatINR(batch.defaultFee) })}
              </Text>
              {active ? null : <Chip label={t('batches.archived')} />}
            </Card>
            {active && roster.length > 0 ? (
              <Button
                title={t('batches.takeAttendance')}
                onPress={() =>
                  navigation.navigate('MarkAttendance', { batchId: batch.id, date: todayYmd() })
                }
              />
            ) : null}
            <AttendanceSummary batchId={batch.id} />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                title={t('batches.edit')}
                onPress={() => navigation.navigate('BatchForm', { id: batch.id })}
              />
              <Button
                style={{ flex: 1 }}
                variant="secondary"
                title={t(active ? 'batches.archive' : 'batches.restore')}
                // archiving takes the batch off attendance, so ask first; restoring is harmless
                onPress={active ? () => setConfirmArchive(true) : archive}
                disabled={busy}
              />
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: spacing.md,
              }}
            >
              <Text style={type.heading}>{t('batches.roster', { count: roster.length })}</Text>
              <Button
                size="small"
                title={t('batches.addStudents')}
                onPress={() => setSheet(true)}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          students.isLoading ? (
            <View style={{ gap: spacing.sm }}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} height={56} />
              ))}
            </View>
          ) : students.isError && !students.data ? (
            <EmptyState
              icon="alert-circle-outline"
              title={t('common.error')}
              actionLabel={t('common.retry')}
              onAction={() => void students.refetch()}
            />
          ) : (
            <EmptyState
              icon="people-outline"
              title={t('batches.noStudents')}
              actionLabel={t(others.length ? 'batches.addStudents' : 'batches.addNewStudent')}
              onAction={others.length ? () => setSheet(true) : addNewStudent}
            />
          )
        }
        renderItem={({ item }) => (
          <ListItem
            title={item.name}
            subtitle={item.class ? ct('levelValue', { n: item.class }) : undefined}
            left={<Avatar name={item.name} uri={item.photoUrl} />}
            right={
              <Button
                variant="ghost"
                size="small"
                title={t('batches.remove')}
                disabled={busy}
                onPress={() => setRemoving(item)}
              />
            }
            onPress={() => navigation.navigate('StudentProfile', { id: item.id })}
          />
        )}
      />

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={t('batches.addStudents')}>
        {others.length > 0 ? (
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={t('students.searchHint')}
          />
        ) : null}
        <FlatList
          style={{ maxHeight: 360, marginVertical: spacing.sm }}
          data={candidates}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[type.caption, { paddingVertical: spacing.md }]}>
              {others.length ? t('students.noMatch') : t('batches.noCandidates')}
            </Text>
          }
          renderItem={({ item }) => (
            <PickRow
              title={item.name}
              subtitle={item.class ? ct('levelValue', { n: item.class }) : undefined}
              photoUrl={item.photoUrl}
              checked={picked.includes(item.id)}
              onToggle={() =>
                setPicked((p) =>
                  p.includes(item.id) ? p.filter((x) => x !== item.id) : [...p, item.id],
                )
              }
            />
          )}
        />
        {others.length > 0 ? (
          <Button
            title={t('batches.addN', { count: picked.length })}
            onPress={addPicked}
            disabled={picked.length === 0}
            loading={busy}
          />
        ) : null}
        <Button
          variant={others.length ? 'ghost' : 'primary'}
          title={t('batches.addNewStudent')}
          onPress={addNewStudent}
        />
      </BottomSheet>

      <ConfirmSheet
        visible={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={t('batches.archiveTitle', { name: batch.name })}
        message={t('batches.archiveText')}
        confirmLabel={t('batches.archiveConfirm')}
        onConfirm={archive}
        loading={busy}
        destructive
      />
      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title={t('batches.removeTitle', { name: removing?.name ?? '' })}
        message={t('batches.removeText', { name: removing?.name ?? '' })}
        confirmLabel={t('batches.removeConfirm')}
        onConfirm={remove}
        loading={busy}
        destructive
      />
    </Screen>
  );
}
