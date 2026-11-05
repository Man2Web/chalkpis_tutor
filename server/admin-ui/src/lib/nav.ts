import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  FileClock,
  Grid3x3,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  ReceiptIndianRupee,
  ServerCog,
  TrendingUp,
  Trophy,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { Cap } from './api';

/**
 * A page in the sidebar; `about` is the one line under its title that says what it is for, and `cap` what the
 * signed-in role needs to see it (see server/src/admin/team.ts).
 */
export type Page = { id: string; label: string; icon: LucideIcon; group: string; keys?: string; about: string; cap: Cap };

export const NAV: { group: string; pages: Page[] }[] = [
  {
    group: 'Home',
    pages: [
      {
        id: 'overview',
        label: 'Overview',
        icon: LayoutDashboard,
        group: 'Home',
        keys: 'g o',
        about: 'How Chalkpis is doing today: sign-ups, active centres, revenue and anything that needs you.',
        cap: 'view',
      },
    ],
  },
  {
    group: 'Customers',
    pages: [
      {
        id: 'centres',
        label: 'Centres',
        icon: Building2,
        group: 'Customers',
        keys: 'g c',
        about: 'Every class, academy and institute using Chalkpis. Open one to see its people, plan, payments and activity.',
        cap: 'view',
      },
      {
        id: 'logins',
        label: 'People',
        icon: Users,
        group: 'Customers',
        keys: 'g l',
        about: 'Everyone who signs in: tutors and their helpers. Look someone up, sign them out, block or delete a test login.',
        cap: 'view',
      },
      {
        id: 'signins',
        label: 'Login codes',
        icon: KeyRound,
        group: 'Customers',
        about: 'The latest WhatsApp login codes asked for in the app, and what happened. Look here first when a tutor cannot sign in.',
        cap: 'view',
      },
      {
        id: 'leaders',
        label: 'Leaderboard',
        icon: Trophy,
        group: 'Customers',
        about: 'The most active centres, to learn from and to thank.',
        cap: 'view',
      },
    ],
  },
  {
    group: 'Billing',
    pages: [
      {
        id: 'subscriptions',
        label: 'Subscriptions',
        icon: CreditCard,
        group: 'Billing',
        keys: 'g b',
        about: "Every centre's plan: who pays, who is on a free trial, who ends soon and who has ended.",
        cap: 'money',
      },
      {
        id: 'payments',
        label: 'Payments',
        icon: ReceiptIndianRupee,
        group: 'Billing',
        keys: 'g p',
        about: 'Every plan payment and the money it brought in.',
        cap: 'money',
      },
      {
        id: 'revenue',
        label: 'Revenue & growth',
        icon: TrendingUp,
        group: 'Billing',
        keys: 'g g',
        about: 'MRR, ARR, conversion and churn, month by month and by where it was paid. Download for investors.',
        cap: 'money',
      },
    ],
  },
  {
    group: 'Engagement',
    pages: [
      {
        id: 'whatsapp',
        label: 'WhatsApp',
        icon: MessageCircle,
        group: 'Engagement',
        keys: 'g w',
        about: 'What WhatsApp costs, the balance and when to recharge, and every message to parents and owners: what went out and what failed.',
        cap: 'view',
      },
      {
        id: 'announce',
        label: 'Announcements',
        icon: Megaphone,
        group: 'Engagement',
        keys: 'g n',
        about: 'News for tutors: a banner in the app, the Updates inbox and a push notification, to everyone or a chosen group.',
        cap: 'manage',
      },
      {
        id: 'activity',
        label: 'Live activity',
        icon: Activity,
        group: 'Engagement',
        keys: 'g f',
        about: 'What is happening across all centres right now.',
        cap: 'view',
      },
    ],
  },
  {
    group: 'Insights',
    pages: [
      {
        id: 'analytics',
        label: 'Analytics',
        icon: BarChart3,
        group: 'Insights',
        keys: 'g a',
        about: 'Growth over time: sign-ups, usage, conversion and revenue.',
        cap: 'view',
      },
      {
        id: 'cohorts',
        label: 'Retention',
        icon: Grid3x3,
        group: 'Insights',
        keys: 'g r',
        about: 'Of the centres that joined each week, how many keep using Chalkpis.',
        cap: 'money',
      },
    ],
  },
  {
    group: 'Admin',
    pages: [
      {
        id: 'team',
        label: 'Team',
        icon: UserCog,
        group: 'Admin',
        about: 'Who can open this dashboard and what each one may do. Add, change or remove team members.',
        cap: 'team',
      },
      {
        id: 'audit',
        label: 'Audit log',
        icon: FileClock,
        group: 'Admin',
        about: 'Everything the team changed, exported or deleted, with who and when.',
        cap: 'export',
      },
      {
        id: 'system',
        label: 'System health',
        icon: ServerCog,
        group: 'Admin',
        keys: 'g s',
        about: 'Is everything running: the server, the database, WhatsApp and the background jobs.',
        cap: 'view',
      },
    ],
  },
];
export const PAGES = NAV.flatMap((g) => g.pages);
/** The sidebar for the signed-in role: only the pages it may open, and no empty groups. */
export const navFor = (caps: Cap[]) =>
  NAV.map((g) => ({ ...g, pages: g.pages.filter((p) => caps.includes(p.cap)) })).filter((g) => g.pages.length);
export const pageOf = (id: string) => PAGES.find((p) => p.id === id);
/** "g" then this letter jumps to the page. */
export const JUMP: Record<string, string> = Object.fromEntries(
  PAGES.filter((p) => p.keys).map((p) => [p.keys!.slice(2), p.id]),
);
