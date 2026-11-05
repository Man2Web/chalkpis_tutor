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
  sending: 'warning',
};

export function MessageLogScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'hi' ? 'hi-IN' : 'en-IN';
  const messages = useMessages();
  const students = useStudents();
  const [filter, setFilter] = useState<'all' | 'failed' | 'skipped'>('all');

  const byId = useMemo(() => new Map((students.data ?? []).map((s) => [s.id, s])), [students.data]);
  const list = (messages.data ?? []).filter((m) => filter === 'all' || m.status === filter);

  // a failed refetch keeps the list on screen; only a first load that failed shows the error
  if (messages.isError && !messages.data)
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
            // a known reason in plain words; a provider's raw code ("http-401") means nothing to an owner
            const detail = rk
              ? t(rk)
              : item.status === 'failed'
                ? t('messages.reason.undelivered')
                : '';
            return (
              <ListItem
                title={s?.name ?? '—'}
                subtitle={[
                  t(`messages.type.${item.type}`),
                  prettyDate(toYmd(item.createdAt.toDate()), locale),
                ].join(' • ')}
                left={<Avatar name={s?.name ?? '?'} uri={s?.photoUrl} size={40} />}
                right={
                  <Chip label={t(`messages.status.${item.status}`)} tone={TONE[item.status]} />
                }
                // why it failed or was skipped gets a line of its own, so it is never cut off
                below={
                  detail ? (
                    <Text
                      style={[
                        type.caption,
                        {
                          flexShrink: 1,
                          color: item.status === 'failed' ? colors.danger : colors.textMuted,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {detail}
                    </Text>
                  ) : undefined
                }
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
