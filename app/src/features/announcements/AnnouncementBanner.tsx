import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { haptic } from '../../lib/haptics';
import { open } from '../../lib/contact';
import { colors, radius, spacing, type } from '../../theme';

interface Announcement {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning';
  link: string;
}

const KEY = 'chalkpis.dismissedAnnouncements';
const TONES = {
  info: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'megaphone' as const },
  success: { bg: colors.successSoft, fg: colors.success, icon: 'sparkles' as const },
  warning: { bg: colors.warningSoft, fg: colors.warning, icon: 'warning' as const },
};

async function readDismissed(): Promise<string[]> {
  try {
    return JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

/** Notices from Chalkpis (new features, maintenance), posted from the admin dashboard. Closing one hides it for good. */
export function AnnouncementBanner() {
  const q = useQuery({
    queryKey: ['announcements'],
    queryFn: async () =>
      (await api<{ announcements: Announcement[] }>('GET', '/announcements')).announcements,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const [dismissed, setDismissed] = useState<string[] | null>(null);
  useEffect(() => {
    void readDismissed().then(setDismissed);
  }, []);
  if (!q.data || !dismissed) return null;
  const a = q.data.find((x) => !dismissed.includes(x.id));
  if (!a) return null;
  const tone = TONES[a.tone] ?? TONES.info;

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
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radius.md,
        backgroundColor: tone.bg,
        alignItems: 'flex-start',
      }}
    >
      <Ionicons name={tone.icon} size={20} color={tone.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.label, { color: tone.fg }]}>{a.title}</Text>
        {a.body ? <Text style={[type.footnote, { color: colors.text }]}>{a.body}</Text> : null}
      </View>
      <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
        <Ionicons name="close" size={18} color={tone.fg} />
      </Pressable>
    </Pressable>
  );
}
