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
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** A page in the sidebar; `about` is the one line under its title that says what it is for. */
export type Page = { id: string; label: string; icon: LucideIcon; group: string; keys?: string; about: string };

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
      },
      {
        id: 'logins',
        label: 'People',
        icon: Users,
        group: 'Customers',
        keys: 'g l',
        about: 'Everyone who signs in: tutors and their helpers. Block, sign out or look someone up.',
      },
      {
        id: 'leaders',
        label: 'Leaderboard',
        icon: Trophy,
        group: 'Customers',
        about: 'The most active centres, to learn from and to thank.',
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
      },
      {
        id: 'payments',
        label: 'Payments',
        icon: ReceiptIndianRupee,
        group: 'Billing',
        keys: 'g p',
        about: 'Every plan payment and the money it brought in.',
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
        about: 'Messages Chalkpis sends to parents: what went out, what failed and why. Retry failed ones.',
      },
      {
        id: 'announce',
        label: 'Announcements',
        icon: Megaphone,
        group: 'Engagement',
        keys: 'g n',
        about: 'A banner every tutor sees in the app, for news and maintenance notices.',
      },
      {
        id: 'activity',
        label: 'Live activity',
        icon: Activity,
        group: 'Engagement',
        keys: 'g f',
        about: 'What is happening across all centres right now.',
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
      },
      {
        id: 'cohorts',
        label: 'Retention',
        icon: Grid3x3,
        group: 'Insights',
        keys: 'g r',
        about: 'Of the centres that joined each week, how many keep using Chalkpis.',
      },
    ],
  },
  {
    group: 'Settings',
    pages: [
      {
        id: 'signins',
        label: 'Login codes',
        icon: KeyRound,
        group: 'Settings',
        about: 'The latest WhatsApp login codes asked for in the app, and what happened. Use it when a tutor cannot sign in.',
      },
      {
        id: 'audit',
        label: 'Audit log',
        icon: FileClock,
        group: 'Settings',
        about: 'Everything an admin changed or exported, with who and when.',
      },
      {
        id: 'system',
        label: 'System health',
        icon: ServerCog,
        group: 'Settings',
        keys: 'g s',
        about: 'Is everything running: the server, the database, WhatsApp and the background jobs.',
      },
    ],
  },
];
export const PAGES = NAV.flatMap((g) => g.pages);
export const pageOf = (id: string) => PAGES.find((p) => p.id === id);
/** "g" then this letter jumps to the page. */
export const JUMP: Record<string, string> = Object.fromEntries(
  PAGES.filter((p) => p.keys).map((p) => [p.keys!.slice(2), p.id]),
);
