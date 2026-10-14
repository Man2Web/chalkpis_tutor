import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, View } from 'react-native';
import { Alert } from 'panelui-native/components/alert';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { haptic } from '../../lib/haptics';
import { colors } from '../../theme';
import { openTarget, track, type Update } from './updates';

const KEY = 'chalkpis.dismissedAnnouncements';
const VARIANT = { info: 'info', success: 'success', warning: 'warning' } as const;

async function readDismissed(): Promise<string[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/**
 * Notices from Chalkpis (new features, maintenance, billing), posted from the admin dashboard: the most important one
 * still open shows here, with its button when it has one. Closing it hides it for good (it stays in Updates). Seeing,
 * pressing and closing it are counted for the dashboard.
 */
export function AnnouncementBanner() {
  const { t } = useTranslation();
  const nav = useNavigation();
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: async () =>
      (await api<{ announcements: Update[] }>('GET', '/announcements')).announcements,
    // Fresh within a minute: refetched whenever Home comes into view or the app returns to the foreground, and every
    // few minutes while it stays open, so a new announcement (or one the admin ended) shows up without a restart.
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
  useFocusEffect(
    useCallback(() => {
      void q.refetch();
    }, []),
  );
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  useEffect(() => {
    void readDismissed().then(setDismissed);
  }, []);
  const a =
    q.data && dismissed ? q.data.find((x) => !dismissed.includes(x.id) && !x.dismissed) : undefined;

  // counted as seen once per announcement shown
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!a || a.read || seen.current.has(a.id)) return;
    seen.current.add(a.id);
    void track(a.id, 'seen');
  }, [a]);

  if (!a || !dismissed) return null;

  const close = () => {
    haptic.tap();
    const next = [...dismissed, a.id].slice(-30);
    setDismissed(next);
    void SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
    void track(a.id, 'dismissed');
  };
  const go = () => {
    haptic.tap();
    void track(a.id, 'clicked');
    openTarget(nav.navigate as unknown as (name: string, params?: object) => void, a);
  };
  const hasTarget = !!(a.link || a.screen);
  const cta = a.ctaLabel?.trim() && hasTarget ? a.ctaLabel.trim() : '';

  return (
    <Pressable
      // an older announcement with a link and no button label: the whole banner opens it, as before
      onPress={!cta && hasTarget ? go : undefined}
      disabled={!!cta || !hasTarget}
      accessibilityRole={!cta && hasTarget ? 'link' : undefined}
    >
      <Alert variant={VARIANT[a.tone] ?? 'info'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{a.title}</Alert.Title>
          {a.body ? <Alert.Description>{a.body}</Alert.Description> : null}
          {cta ? (
            <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Button
                title={cta}
                onPress={go}
                size="small"
                variant="outline"
                icon={<Ionicons name="arrow-forward" size={14} color={colors.text} />}
              />
            </View>
          ) : null}
        </Alert.Content>
        <Pressable
          onPress={close}
          // 18 dp icon + 13 dp on each side: a 44 dp target
          hitSlop={13}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          className="ml-auto"
        >
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </Pressable>
      </Alert>
    </Pressable>
  );
}
