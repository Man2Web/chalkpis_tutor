import {
  Activity,
  BarChart3,
  Building2,
  FileClock,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  ServerCog,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type Page = { id: string; label: string; icon: LucideIcon; group: string; keys?: string };

export const NAV: { group: string; pages: Page[] }[] = [
  {
    group: 'Insights',
    pages: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Insights', keys: 'g o' },
      { id: 'analytics', label: 'Analytics', icon: BarChart3, group: 'Insights', keys: 'g a' },
      { id: 'cohorts', label: 'Retention', icon: Grid3x3, group: 'Insights', keys: 'g r' },
    ],
  },
  {
    group: 'Customers',
    pages: [
      { id: 'centres', label: 'Centres', icon: Building2, group: 'Customers', keys: 'g c' },
      { id: 'logins', label: 'Logins', icon: Users, group: 'Customers', keys: 'g l' },
      { id: 'leaders', label: 'Leaderboard', icon: Trophy, group: 'Customers' },
    ],
  },
  {
    group: 'Engagement',
    pages: [
      { id: 'activity', label: 'Live activity', icon: Activity, group: 'Engagement', keys: 'g f' },
      { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, group: 'Engagement', keys: 'g w' },
      { id: 'announce', label: 'Announcements', icon: Megaphone, group: 'Engagement', keys: 'g n' },
    ],
  },
  {
    group: 'Admin',
    pages: [
      { id: 'signins', label: 'Sign-ins', icon: KeyRound, group: 'Admin' },
      { id: 'audit', label: 'Audit log', icon: FileClock, group: 'Admin' },
      { id: 'system', label: 'System health', icon: ServerCog, group: 'Admin', keys: 'g s' },
    ],
  },
];
export const PAGES = NAV.flatMap((g) => g.pages);
export const pageOf = (id: string) => PAGES.find((p) => p.id === id);
/** "g" then this letter jumps to the page. */
export const JUMP: Record<string, string> = Object.fromEntries(
  PAGES.filter((p) => p.keys).map((p) => [p.keys!.slice(2), p.id]),
);
