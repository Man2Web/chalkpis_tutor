import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Chip,
  EmptyState,
  ListItem,
  Screen,
  Skeleton,
  UpgradePrompt,
} from '../../components';
import { useAddGuard } from '../../data/guards';
import { useBatches } from '../../data/hooks';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing, type } from '../../theme';
import { scheduleLabel } from './format';

export function BatchesScreen({ navigation }: NativeStackScreenProps<MainStackParams, 'Batches'>) {
  const { t } = useTranslation();
  const batches = useBatches();
  const guard = useAddGuard();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const list = useMemo(
    () => (batches.data ?? []).filter((b) => b.status === tab),
    [batches.data, tab],
  );

  const add = () => {
    if (guard.check('batch')) navigation.navigate('BatchForm');
  };

  if (batches.isError) {
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
  }

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text style={type.title}>{t('batches.title')}</Text>
          <Button title={t('batches.add')} onPress={add} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Chip
            label={t('batches.active')}
            selected={tab === 'active'}
            onPress={() => setTab('active')}
          />
          <Chip
            label={t('batches.archived')}
            selected={tab === 'archived'}
            onPress={() => setTab('archived')}
          />
        </View>
      </View>
      {batches.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(b) => b.id}
          refreshControl={
            <RefreshControl
              refreshing={batches.isRefetching}
              onRefresh={() => void batches.refetch()}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border }} />
          )}
          ListEmptyComponent={
            tab === 'active' ? (
              <EmptyState
                icon="albums-outline"
                title={t('batches.emptyTitle')}
                message={t('batches.emptyMessage')}
                actionLabel={t('batches.add')}
                onAction={add}
              />
            ) : (
              <EmptyState icon="archive-outline" title={t('batches.noArchived')} />
            )
          }
          renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={`${item.subject} • ${scheduleLabel(item, t)}`}
              right={<Chip label={t('batches.studentsN', { count: item.studentCount })} />}
              onPress={() => navigation.navigate('BatchDetail', { id: item.id })}
            />
          )}
        />
      )}
      <UpgradePrompt
        visible={!!guard.blocked}
        kind={guard.blocked?.kind ?? 'batch'}
        limit={guard.blocked?.limit}
        onClose={guard.close}
      />
    </Screen>
  );
}
