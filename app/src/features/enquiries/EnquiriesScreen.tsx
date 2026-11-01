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
import { shortDate, todayYmd } from '../../lib/dates';
import type { MainStackParams } from '../../navigation/types';
import { colors, spacing } from '../../theme';
import { useEnquiries, type Enquiry } from './api';
import { conversion, followUpLabel, OPEN_STAGES, STAGES, stageTone, type Stage } from './logic';

/** The line under an enquiry's name: what they want, and where they heard about the centre. */
export function enquiryLine(e: Enquiry, t: (k: string) => string) {
  return [e.interest || e.batchName, e.class, t(`enquiries.sources.${e.source}`)]
    .filter(Boolean)
    .join(' · ');
}

/** Everyone who asked about classes: open ones first with the soonest follow-up, a filter per stage. */
export function EnquiriesScreen({
  navigation,
}: NativeStackScreenProps<MainStackParams, 'Enquiries'>) {
  const { t } = useTranslation();
  const q = useEnquiries();
  const [stage, setStage] = useState<Stage | 'open'>('open');
  const today = todayYmd();
  const data = q.data;
  const shown = (data?.enquiries ?? []).filter((e) =>
    stage === 'open' ? OPEN_STAGES.includes(e.status) : e.status === stage,
  );
  const openCount = OPEN_STAGES.reduce((n, s) => n + (data?.counts[s] ?? 0), 0);
  const rate = data ? conversion(data.thisMonth.joined, data.thisMonth.enquiries) : null;

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Button
          title={t('enquiries.add')}
          icon={<Ionicons name="add" size={18} color={colors.onPrimary} />}
          onPress={() => navigation.navigate('EnquiryForm')}
        />
        {data ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {data.dueFollowUps ? (
              <Chip
                small
                tone="warning"
                label={t('enquiries.dueCount', { count: data.dueFollowUps })}
              />
            ) : null}
            <Chip
              small
              tone="success"
              label={t('enquiries.joinedThisMonth', {
                joined: data.thisMonth.joined,
                total: data.thisMonth.enquiries,
              })}
            />
            {rate !== null ? (
              <Chip small label={t('enquiries.conversion', { percent: rate })} />
            ) : null}
          </View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          <Chip
            label={`${t('enquiries.open')} ${openCount}`}
            selected={stage === 'open'}
            onPress={() => setStage('open')}
          />
          {STAGES.map((s) => (
            <Chip
              key={s}
              label={`${t(`enquiries.stage.${s}`)} ${data?.counts[s] ?? 0}`}
              selected={stage === s}
              onPress={() => setStage(s)}
            />
          ))}
        </ScrollView>
      </View>
      {q.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={56} />
          ))}
        </View>
      ) : q.isError ? (
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void q.refetch()}
        />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={listCard}
          data={shown}
          keyExtractor={(e) => e.id}
          ItemSeparatorComponent={InsetSeparator}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="person-add-outline"
              title={t('enquiries.emptyTitle')}
              message={t('enquiries.emptyText')}
            />
          }
          renderItem={({ item }) => {
            const f = followUpLabel(t, item.nextFollowUp, today, (d) => shortDate(d, 'en-IN'));
            return (
              <ListItem
                title={item.name}
                subtitle={enquiryLine(item, t)}
                right={
                  f && OPEN_STAGES.includes(item.status) ? (
                    <Chip small tone={f.tone} label={f.text} />
                  ) : (
                    <Chip
                      small
                      tone={stageTone(item.status)}
                      label={t(`enquiries.stage.${item.status}`)}
                    />
                  )
                }
                onPress={() => navigation.navigate('Enquiry', { id: item.id })}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}
