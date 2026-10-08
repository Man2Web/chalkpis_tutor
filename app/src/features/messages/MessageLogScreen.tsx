import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Avatar, Chip, EmptyState, ListItem, Screen, Skeleton } from '../../components';
import { useMessages, useStudents } from '../../data/hooks';
import { prettyDate, toYmd } from '../../lib/dates';
import { colors, radius, spacing, type } from '../../theme';
import { reasonKey, type MessageStatus } from './settings';

const TONE: Record<MessageStatus, 'success' | 'danger' | 'neutral' | 'warning'> = {
  sent: 'success',
  failed: 'danger',
  skipped: 'neutral',
  queued: 'warning',
};

export function MessageLogScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const messages = useMessages();
  const students = useStudents();
  const [filter, setFilter] = useState<'all' | 'failed' | 'skipped'>('all');

  const byId = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const list = (messages.data ?? []).filter((m) => filter === 'all' || m.status === filter);

  if (messages.isError)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void messages.refetch()}
        />
      </Screen>
    );

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Text style={type.largeTitle}>{t('messages.logTitle')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Chip
            label={t('messages.filter.all')}
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
          />
          <Chip
            label={t('messages.filter.failed')}
            selected={filter === 'failed'}
            tone="danger"
            onPress={() => setFilter('failed')}
          />
          <Chip
            label={t('messages.filter.skipped')}
            selected={filter === 'skipped'}
            onPress={() => setFilter('skipped')}
          />
        </View>
      </View>
      {messages.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(m) => m.id}
          style={{
            marginHorizontal: spacing.lg,
            marginBottom: spacing.md,
            borderRadius: radius.lg,
            overflow: 'hidden',
          }}
          refreshControl={
            <RefreshControl
              refreshing={messages.isRefetching}
              onRefresh={() => void messages.refetch()}
            />
          }
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.border }} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="chatbubbles-outline"
              title={t('messages.empty')}
              message={t('messages.emptyHint')}
            />
          }
          renderItem={({ item }) => {
            const s = byId.get(item.studentId);
            const rk = reasonKey(item.reason);
            const detail = rk ? t(rk) : (item.error ?? item.reason ?? '');
            return (
              <ListItem
                title={s?.name ?? '—'}
                subtitle={[
                  t(`messages.type.${item.type}`),
                  prettyDate(toYmd(item.createdAt.toDate()), locale),
                  detail,
                ]
                  .filter(Boolean)
                  .join(' • ')}
                left={<Avatar name={s?.name ?? '?'} uri={s?.photoUrl} size={40} />}
                right={
                  <Chip label={t(`messages.status.${item.status}`)} tone={TONE[item.status]} />
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
