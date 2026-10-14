import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen, Skeleton } from '../../components';
import { Button } from '../../components/Button';
import { haptic } from '../../lib/haptics';
import { colors, font, radius, spacing, type } from '../../theme';
import { CATEGORY_ICON, markAllRead, openTarget, track, useUpdates, type Update } from './updates';

const when = (iso: string | undefined, locale: string) =>
  iso
    ? new Date(iso).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: 'Asia/Kolkata',
      })
    : '';

/** One update: tap to open it in full (and mark it read); its button, when it has one, goes where it points. */
function Row({ u, open, onToggle }: { u: Update; open: boolean; onToggle: () => void }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigation();
  const icon = CATEGORY_ICON[u.category ?? 'update'];
  const urgent = u.priority === 'critical' || u.priority === 'important';
  const cta = u.ctaLabel?.trim() && (u.link || u.screen) ? u.ctaLabel.trim() : '';
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={[u.read ? '' : t('updates.unread'), u.title].filter(Boolean).join(', ')}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        backgroundColor: u.read ? colors.surface : colors.infoSoft,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: u.priority === 'critical' ? colors.warningSoft : colors.fill,
        }}
      >
        <Ionicons
          name={icon}
          size={20}
          color={u.priority === 'critical' ? colors.warning : colors.text}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          <Text style={[type.caption, { color: colors.textMuted, flex: 1 }]} numberOfLines={1}>
            {t(`updates.category.${u.category ?? 'update'}`)}
            {urgent ? ` · ${t(`updates.priority.${u.priority}`)}` : ''}
          </Text>
          <Text style={[type.caption, { color: colors.textMuted }]}>
            {when(u.startsAt, i18n.language === 'hi' ? 'hi-IN' : 'en-IN')}
          </Text>
          {!u.read ? (
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.infoFill }}
            />
          ) : null}
        </View>
        <Text
          style={[type.body, font(u.read ? '500' : '700')]}
          numberOfLines={open ? undefined : 2}
        >
          {u.title}
        </Text>
        {u.body ? (
          <Text
            style={[type.subhead, { color: colors.textMuted }]}
            numberOfLines={open ? undefined : 2}
          >
            {u.body}
          </Text>
        ) : null}
        {open && cta ? (
          <View style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
            <Button
              title={cta}
              size="small"
              onPress={() => {
                haptic.tap();
                void track(u.id, 'clicked');
                openTarget(nav.navigate as unknown as (name: string, params?: object) => void, u);
              }}
              icon={<Ionicons name="arrow-forward" size={14} color={colors.bg} />}
            />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Updates: every announcement Chalkpis sent this person, newest first; the bell on Home opens it. */
export function UpdatesScreen() {
  const { t } = useTranslation();
  const q = useUpdates();
  const [open, setOpen] = useState<string | null>(null);
  const list = q.data?.updates ?? [];

  if (q.isError)
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('common.error')}
          actionLabel={t('common.retry')}
          onAction={() => void q.refetch()}
        />
      </Screen>
    );

  return (
    <Screen scroll={false} padded={false}>
      <View
        style={{
          padding: spacing.lg,
          paddingBottom: spacing.md,
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: spacing.md,
        }}
      >
        <Text style={type.largeTitle}>{t('updates.title')}</Text>
        {q.data?.unread ? (
          <Pressable
            onPress={() => {
              haptic.tap();
              void markAllRead();
            }}
            accessibilityRole="button"
            hitSlop={10}
          >
            <Text style={[type.subhead, font('600'), { color: colors.primaryDark }]}>
              {t('updates.markAllRead')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {q.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={72} />
          <Skeleton height={72} />
          <Skeleton height={72} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(u) => u.id}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />
          }
          renderItem={({ item }) => (
            <Row
              u={item}
              open={open === item.id}
              onToggle={() => {
                haptic.select();
                setOpen((o) => (o === item.id ? null : item.id));
                if (!item.read) void track(item.id, 'seen');
              }}
            />
          )}
          ListEmptyComponent={
            <View style={{ paddingTop: spacing.xl }}>
              <EmptyState
                icon="notifications-outline"
                title={t('updates.empty')}
                message={t('updates.emptyBody')}
              />
            </View>
          }
        />
      )}
    </Screen>
  );
}

/** The bell on Home: opens Updates, with how many are unread. */
export function UpdatesBell() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const q = useUpdates();
  const unread = q.data?.unread ?? 0;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        (nav.navigate as unknown as (name: string) => void)('Updates');
      }}
      accessibilityRole="button"
      accessibilityLabel={unread ? t('updates.bellUnread', { count: unread }) : t('updates.title')}
      hitSlop={8}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons
        name={unread ? 'notifications' : 'notifications-outline'}
        size={24}
        color={colors.text}
      />
      {unread ? (
        <View
          style={{
            position: 'absolute',
            top: 6,
            right: 4,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: colors.dangerFill,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: colors.bg,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
