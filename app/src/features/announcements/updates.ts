import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { open } from '../../lib/contact';
import { queryClient } from '../../lib/queryClient';

/** An announcement from Chalkpis, as the app shows it (a banner, an item in Updates). */
export interface Update {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'success' | 'warning';
  link: string;
  category?: 'update' | 'feature' | 'maintenance' | 'billing' | 'tip' | 'policy';
  priority?: 'normal' | 'important' | 'critical';
  ctaLabel?: string;
  /** A screen in the app the button opens (Home, Students, Attendance, Fees, Billing, Updates). */
  screen?: string;
  startsAt?: string;
  read?: boolean;
  dismissed?: boolean;
}

type IconName = ComponentProps<typeof Ionicons>['name'];
export const CATEGORY_ICON: Record<NonNullable<Update['category']>, IconName> = {
  update: 'megaphone-outline',
  feature: 'rocket-outline',
  maintenance: 'construct-outline',
  billing: 'card-outline',
  tip: 'bulb-outline',
  policy: 'document-text-outline',
};

/** Everything Chalkpis sent this person in the last 60 days, and how many they have not read. */
export function useUpdates() {
  return useQuery({
    queryKey: ['updates'],
    queryFn: () => api<{ updates: Update[]; unread: number }>('GET', '/me/updates'),
    staleTime: 60_000,
    refetchInterval: 3 * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

/** What the person did with an announcement (it counts in the dashboard). Never fails the screen. */
export function track(id: string, type: 'seen' | 'clicked' | 'dismissed' | 'opened') {
  return api('POST', `/announcements/${id}/events`, { type })
    .then(() => void queryClient.invalidateQueries({ queryKey: ['updates'] }))
    .catch(() => undefined);
}

export function markAllRead() {
  return api('POST', '/me/updates/read-all')
    .then(() => void queryClient.invalidateQueries({ queryKey: ['updates'] }))
    .catch(() => undefined);
}

/** Main-tab screens reach through the tab navigator; the rest are screens of their own. */
const TABS = new Set(['Home', 'Students', 'Attendance', 'Fees']);
type Go = (name: string, params?: object) => void;

/** Where the announcement's button goes: a web page, or a screen in the app. True when it went somewhere. */
export function openTarget(navigate: Go, u: Pick<Update, 'link' | 'screen'>): boolean {
  if (u.link) {
    void open(u.link);
    return true;
  }
  if (!u.screen) return false;
  if (TABS.has(u.screen)) navigate('Tabs', { screen: u.screen });
  else navigate(u.screen);
  return true;
}
