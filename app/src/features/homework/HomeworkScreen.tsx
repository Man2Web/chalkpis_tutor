import { useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Chip,
  EmptyState,
  InsetSeparator,
  ListItem,
  listCard,
  Screen,
  Skeleton,
} from '../../components';
import { useBatches } from '../../data/hooks';
import { shortDate, todayYmd } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import { useHomeworkList, type HomeworkListItem } from './api';
import { dueLabel } from './logic';

/** Where a piece of homework stands: not checked, some checked, or all checked (with how many missed it). */
export function homeworkStatus(
  h: HomeworkListItem,
  t: (k: string, o?: Record<string, unknown>) => string,
) {
  const checked = h.done + h.missing;
  if (checked === 0) return { label: t('homework.statusNone'), tone: 'neutral' as const };
  if (h.missing)
    return { label: t('homework.statusMissing', { count: h.missing }), tone: 'danger' as const };
  if (checked < h.students)
    return {
      label: t('homework.statusSome', { checked, total: h.students }),
      tone: 'warning' as const,
    };
  return { label: t('homework.statusAll'), tone: 'success' as const };
}

/** All homework, latest due first, one batch at a time if wanted; tap one to share it or tick who handed it in. */
export function HomeworkScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'Homework'>) {
  const { t } = useTranslation();
  const [batchId, setBatchId] = useState<string>();
  const list = useHomeworkList(batchId);
  const batches = useBatches();
  const active = (batches.data ?? []).filter((b) => b.status === 'active');
  const today = todayYmd();

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Button
          title={t('homework.new')}
          icon={<Ionicons name="add" size={18} color={colors.onPrimary} />}
          onPress={() => navigation.navigate('HomeworkForm', batchId ? { batchId } : undefined)}
        />
        {active.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            <Chip
              label={t('homework.allBatches')}
              selected={!batchId}
              onPress={() => setBatchId(undefined)}
            />
            {active.map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                selected={batchId === b.id}
                onPress={() => setBatchId(b.id)}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {list.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : list.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void list.refetch()}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={listCard}
          data={list.data ?? []}
          keyExtractor={(h) => h.id}
          ItemSeparatorComponent={InsetSeparator}
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="book-outline"
              title={t('homework.emptyTitle')}
              message={t('homework.emptyText')}
            />
          }
          renderItem={({ item }) => {
            const st = homeworkStatus(item, t);
            const dateText = shortDate(item.dueOn, 'en-IN');
            const due = dueLabel(t, item.dueOn, today, {
              unchecked: item.students - item.done - item.missing,
              dateText,
            });
            return (
              <ListItem
                title={item.subject ? `${item.title} · ${item.subject}` : item.title}
                subtitle={[
                  item.batchName,
                  // past and everyone checked: just "Was due 5 Nov"
                  ...(due.closed ? [due.text] : [`${t('homework.due')} ${dateText}`, due.text]),
                ].join(' · ')}
                right={<Chip small label={st.label} tone={st.tone} />}
                onPress={() => navigation.navigate('HomeworkCheck', { id: item.id })}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
