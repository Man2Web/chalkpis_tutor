import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  Input,
  ListItem,
  Screen,
  Skeleton,
  toast,
} from '../../components';
import { useBatches, useInstituteId, useRefreshData, useStudents } from '../../data/hooks';
import { reportError } from '../../lib/analytics';
import { formatINR } from '../../lib/money';
import type { MainStackParams } from '../../navigation/types';
import { spacing, type } from '../../theme';
import { addStudentsToBatch, removeStudentFromBatch } from '../students/api';
import { filterStudents } from '../students/logic';
import { AttendanceSummary } from '../attendance/AttendanceSummary';
import { setBatchStatus } from './api';
import { scheduleLabel } from './format';

export function BatchDetailScreen({
  navigation,
  route,
}: NativeStackScreenProps<MainStackParams, 'BatchDetail'>) {
  const { t } = useTranslation();
  const instituteId = useInstituteId();
  const refresh = useRefreshData();
  const batches = useBatches();
  const students = useStudents();
  const batch = batches.data?.find((b) => b.id === route.params.id);

  const [sheet, setSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const roster = useMemo(
    () =>
      (students.data ?? []).filter(
        (s) => s.status === 'active' && s.batchIds.includes(route.params.id),
      ),
    [students.data, route.params.id],
  );
  const candidates = useMemo(
    () =>
      filterStudents(
        (students.data ?? []).filter(
          (s) => s.status === 'active' && !s.batchIds.includes(route.params.id),
        ),
        { search },
      ),
    [students.data, route.params.id, search],
  );

  if (batches.isLoading)
    return (
      <Screen>
        <Skeleton height={80} />
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
      toast(
        t(batch.status === 'active' ? 'batches.archivedToast' : 'batches.restoredToast'),
        'success',
      );
      navigation.goBack();
    });

  return (
    <Screen scroll={false} padded={false}>
      <FlatList
        data={roster}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Text style={type.title}>{batch.name}</Text>
            <Card style={{ gap: spacing.xs }}>
              <Text style={type.body}>
                {batch.subject}
                {batch.class ? ` • ${t('students.classN', { n: batch.class })}` : ''}
              </Text>
              <Text style={type.caption}>{scheduleLabel(batch, t)}</Text>
              <Text style={type.caption}>
                {t('batches.defaultFeeIs', { fee: formatINR(batch.defaultFee) })}
              </Text>
              {batch.status === 'archived' ? <Chip label={t('batches.archived')} /> : null}
            </Card>
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
                title={t(batch.status === 'active' ? 'batches.archive' : 'batches.restore')}
                onPress={archive}
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
              <Button title={t('batches.addStudents')} onPress={() => setSheet(true)} />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon="people-outline" title={t('batches.noStudents')} />}
        renderItem={({ item }) => (
          <ListItem
            title={item.name}
            subtitle={item.class ? t('students.classN', { n: item.class }) : undefined}
            left={<Avatar name={item.name} uri={item.photoUrl} />}
            right={
              <Button
                variant="ghost"
                title={t('batches.remove')}
                disabled={busy}
                onPress={() =>
                  guarded(() => removeStudentFromBatch(instituteId, batch.id, item.id))
                }
              />
            }
            onPress={() => navigation.navigate('StudentProfile', { id: item.id })}
          />
        )}
      />

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title={t('batches.addStudents')}>
        <Input label={t('students.search')} value={search} onChangeText={setSearch} />
        <FlatList
          style={{ maxHeight: 320 }}
          data={candidates}
          keyExtractor={(s) => s.id}
          ListEmptyComponent={<Text style={type.caption}>{t('batches.noCandidates')}</Text>}
          renderItem={({ item }) => (
            <View style={{ marginBottom: spacing.xs }}>
              <Chip
                label={item.name}
                selected={picked.includes(item.id)}
                onPress={() =>
                  setPicked((p) =>
                    p.includes(item.id) ? p.filter((x) => x !== item.id) : [...p, item.id],
                  )
                }
              />
            </View>
          )}
        />
        <Button
          title={t('batches.addN', { count: picked.length })}
          onPress={addPicked}
          disabled={picked.length === 0}
          loading={busy}
        />
      </BottomSheet>
    </Screen>
  );
}
