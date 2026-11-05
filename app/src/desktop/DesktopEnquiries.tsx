import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Button, Chip, EmptyState, Skeleton } from '../components';
import { shortDate, todayYmd } from '../lib/dates';
import { formatIndianPhone } from '../lib/phone';
import type { MainStackParams } from '../navigation/types';
import { colors, font, radius, spacing, type } from '../theme';
import { useEnquiries, type Enquiry } from '../features/enquiries/api';
import { enquiryLine } from '../features/enquiries/EnquiriesScreen';
import { conversion, followUpLabel, stageTone, type Stage } from '../features/enquiries/logic';
import { card, DesktopPage, StatCard, StatGrid, type HoverState } from './parts';

const COLUMNS: Stage[] = ['new', 'follow_up', 'trial', 'joined'];
/**
 * Cards a column shows before "Show N more". Joined and Not interested only grow, so they show the latest few
 * (newest first, as the server sends them); the open stages show far more.
 */
const SHOWN: Record<Stage, number> = { new: 50, follow_up: 50, trial: 50, joined: 8, lost: 8 };

/**
 * Enquiries on a laptop or desktop: the admissions pipeline as a board (New, Follow-up, Trial class, Joined), with
 * the follow-ups due and this month's admissions above it. Not interested is one click away.
 */
export function DesktopEnquiries() {
  const { t } = useTranslation();
  const nav = useNavigation<NativeStackNavigationProp<MainStackParams>>();
  const q = useEnquiries();
  const [showLost, setShowLost] = useState(false);
  // columns opened in full with "Show N more"
  const [expanded, setExpanded] = useState<Partial<Record<Stage, boolean>>>({});
  const today = todayYmd();
  const data = q.data;
  const cols: Stage[] = showLost ? [...COLUMNS, 'lost'] : COLUMNS;
  const open = data ? data.counts.new + data.counts.follow_up + data.counts.trial : 0;
  const rate = data ? conversion(data.thisMonth.joined, data.thisMonth.enquiries) : null;

  return (
    <DesktopPage
      title={t('enquiries.title')}
      subtitle={t('enquiries.desktopSubtitle')}
      actions={
        <>
          <Button
            size="small"
            variant="outline"
            title={t(showLost ? 'enquiries.hideLost' : 'enquiries.showLost', {
              count: data?.counts.lost ?? 0,
            })}
            onPress={() => setShowLost((v) => !v)}
          />
          <Button
            size="small"
            title={t('enquiries.add')}
            icon={<Ionicons name="add" size={16} color={colors.onPrimary} />}
            onPress={() => nav.navigate('EnquiryForm')}
          />
        </>
      }
    >
      {q.isLoading || !data ? (
        q.isError ? (
          <EmptyState
            icon="alert-circle-outline"
            title={t('common.error')}
            actionLabel={t('common.retry')}
            onAction={() => void q.refetch()}
          />
        ) : (
          <Skeleton height={320} />
        )
      ) : (
        <>
          <StatGrid>
            <StatCard
              label={t('enquiries.statDue')}
              value={String(data.dueFollowUps)}
              icon="call-outline"
              tone="warning"
              valueTone={data.dueFollowUps ? 'warning' : 'neutral'}
              sub={t('enquiries.statDueSub')}
            />
            <StatCard
              label={t('enquiries.statOpen')}
              value={String(open)}
              icon="people-outline"
              tone="info"
              sub={t('enquiries.statOpenSub')}
            />
            <StatCard
              label={t('enquiries.statJoined')}
              value={String(data.thisMonth.joined)}
              icon="person-add-outline"
              tone="success"
              valueTone="success"
              sub={t('enquiries.statJoinedSub', { total: data.thisMonth.enquiries })}
            />
            <StatCard
              label={t('enquiries.statConversion')}
              value={rate === null ? '—' : `${rate}%`}
              icon="trending-up"
              tone="neutral"
              sub={t('enquiries.statConversionSub')}
            />
          </StatGrid>
          <View style={{ flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' }}>
            {cols.map((s) => {
              const items = data.enquiries.filter((e) => e.status === s);
              const limit = expanded[s] ? items.length : SHOWN[s];
              const hidden = items.length - limit;
              return (
                <View
                  key={s}
                  style={[
                    card,
                    {
                      flex: 1,
                      minWidth: 0,
                      padding: spacing.md,
                      gap: spacing.sm,
                      backgroundColor: colors.shell,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: spacing.sm,
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text style={[type.label, { flex: 1 }]}>{t(`enquiries.stage.${s}`)}</Text>
                    <Chip small tone={stageTone(s)} label={String(data.counts[s])} />
                  </View>
                  {items.length === 0 ? (
                    <Text style={[type.caption, { padding: spacing.sm }]}>
                      {t('enquiries.columnEmpty')}
                    </Text>
                  ) : (
                    items
                      .slice(0, limit)
                      .map((e) => (
                        <EnquiryCard
                          key={e.id}
                          e={e}
                          today={today}
                          onPress={() => nav.navigate('Enquiry', { id: e.id })}
                        />
                      ))
                  )}
                  {hidden > 0 || (expanded[s] && items.length > SHOWN[s]) ? (
                    <Button
                      size="small"
                      variant="ghost"
                      title={
                        hidden > 0
                          ? t('enquiries.showMore', { count: hidden })
                          : t('enquiries.showFewer')
                      }
                      onPress={() => setExpanded((x) => ({ ...x, [s]: hidden > 0 }))}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        </>
      )}
    </DesktopPage>
  );
}

function EnquiryCard({ e, today, onPress }: { e: Enquiry; today: string; onPress: () => void }) {
  const { t } = useTranslation();
  const f = followUpLabel(t, e.nextFollowUp, today, (d) => shortDate(d, 'en-IN'));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={e.name}
      style={(s: HoverState) => ({
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: s.hovered ? colors.ring : colors.border,
        padding: spacing.md,
        gap: 4,
      })}
    >
      <Text style={[type.subhead, font('600')]} numberOfLines={1}>
        {e.name}
      </Text>
      <Text style={type.caption2} numberOfLines={1}>
        {enquiryLine(e, t)}
      </Text>
      <Text style={type.caption2} numberOfLines={1}>
        {formatIndianPhone(e.phone)}
      </Text>
      {f && (e.status === 'new' || e.status === 'follow_up' || e.status === 'trial') ? (
        <View style={{ flexDirection: 'row', marginTop: 4 }}>
          <Chip small tone={f.tone} label={f.text} />
        </View>
      ) : null}
      {e.lastNote ? (
        <Text style={[type.caption2, { fontStyle: 'italic' }]} numberOfLines={2}>
          “{e.lastNote}”
        </Text>
      ) : null}
    </Pressable>
  );
}
