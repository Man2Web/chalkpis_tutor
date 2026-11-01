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
import { shortDate } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import { useExams, type ExamListItem } from './api';
import { marksText } from './logic';

/** Where a test stands: all marked, some marked, or none yet. */
export function examStatus(e: ExamListItem, t: (k: string, o?: Record<string, unknown>) => string) {
  if (e.entered === 0) return { label: t('exams.statusNone'), tone: 'warning' as const };
  if (e.entered < e.students)
    return {
      label: t('exams.statusSome', { entered: e.entered, total: e.students }),
      tone: 'warning' as const,
    };
  return { label: t('exams.statusDone'), tone: 'success' as const };
}

/** Every test, newest first, one batch at a time if wanted; tap one to enter or see marks. */
export function ExamsScreen({ navigation }: NativeStackScreenProps<MainStackParams, 'Exams'>) {
  const { t } = useTranslation();
  const [batchId, setBatchId] = useState<string>();
  const exams = useExams(batchId);
  const batches = useBatches();
  const active = (batches.data ?? []).filter((b) => b.status === 'active');

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Button
          title={t('exams.new')}
          icon={<Ionicons name="add" size={18} color={colors.onPrimary} />}
          onPress={() => navigation.navigate('ExamForm', batchId ? { batchId } : undefined)}
        />
        {active.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.sm }}
          >
            <Chip
              label={t('exams.allBatches')}
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
      {exams.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : exams.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void exams.refetch()}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={listCard}
          data={exams.data ?? []}
          keyExtractor={(e) => e.id}
          ItemSeparatorComponent={InsetSeparator}
          refreshControl={
            <RefreshControl
              refreshing={exams.isRefetching}
              onRefresh={() => void exams.refetch()}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="document-text-outline"
              title={t('exams.emptyTitle')}
              message={t('exams.emptyText')}
            />
          }
          renderItem={({ item }) => {
            const st = examStatus(item, t);
            return (
              <ListItem
                title={item.subject ? `${item.name} · ${item.subject}` : item.name}
                subtitle={[
                  item.batchName,
                  shortDate(item.date, 'en-IN'),
                  item.average === null
                    ? t('exams.outOfShort', { max: marksText(item.maxMarks) })
                    : t('exams.avgOf', {
                        average: marksText(item.average),
                        max: marksText(item.maxMarks),
                      }),
                ].join(' · ')}
                right={<Chip small label={st.label} tone={st.tone} />}
                onPress={() => navigation.navigate('ExamMarks', { id: item.id })}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
