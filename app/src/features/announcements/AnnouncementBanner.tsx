import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable } from 'react-native';
import { Alert } from 'panelui-native/components/alert';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';
import { haptic } from '../../lib/haptics';
import { open } from '../../lib/contact';
import { colors } from '../../theme';

interface Announcement {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning';
  link: string;
}

const KEY = 'chalkpis.dismissedAnnouncements';
const VARIANT = { info: 'info', success: 'success', warning: 'warning' } as const;

async function readDismissed(): Promise<string[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Notices from Chalkpis (new features, maintenance), posted from the admin dashboard. Closing one hides it for good. */
export function AnnouncementBanner() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: async () =>
      (await api<{ announcements: Announcement[] }>('GET', '/announcements')).announcements,
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
  if (!q.data || !dismissed) return null;
  const a = q.data.find((x) => !dismissed.includes(x.id));
  if (!a) return null;

  const close = () => {
    haptic.tap();
    const next = [...dismissed, a.id].slice(-30);
    setDismissed(next);
    void SecureStore.setItemAsync(KEY, JSON.stringify(next)).catch(() => undefined);
  };

  return (
    <Pressable
      onPress={a.link ? () => void open(a.link) : undefined}
      disabled={!a.link}
      accessibilityRole={a.link ? 'link' : undefined}
    >
      <Alert variant={VARIANT[a.tone] ?? 'info'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{a.title}</Alert.Title>
          {a.body ? <Alert.Description>{a.body}</Alert.Description> : null}
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
