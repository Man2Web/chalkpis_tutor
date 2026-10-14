import {
  CreditCard,
  Lightbulb,
  Megaphone,
  Rocket,
  Scale,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { CATEGORY } from './names';

/** Announcement words and shapes shared by the composer and the list (the server's announcements/service.ts is the authority). */

export type AnnCategory = 'update' | 'feature' | 'maintenance' | 'billing' | 'tip' | 'policy';
export type AnnPriority = 'normal' | 'important' | 'critical';
export const ANN_CATEGORY: Record<AnnCategory, { label: string; icon: LucideIcon; tint: string }> = {
  update: { label: 'Product update', icon: Megaphone, tint: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25' },
  feature: { label: 'New feature', icon: Rocket, tint: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25' },
  maintenance: { label: 'Maintenance', icon: Wrench, tint: 'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/25' },
  billing: { label: 'Billing', icon: CreditCard, tint: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25' },
  tip: { label: 'Tip', icon: Lightbulb, tint: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/30' },
  policy: { label: 'Policy', icon: Scale, tint: 'bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25' },
};
export const PRIORITY: Record<AnnPriority, { label: string; hint: string }> = {
  normal: { label: 'Normal', hint: 'News and tips' },
  important: { label: 'Important', hint: 'Shown first' },
  critical: { label: 'Critical', hint: 'Outages; ignores quiet hours' },
};
export const WHO: Record<string, string> = { all: 'Tutors and helpers', owners: 'Tutors', staff: 'Helpers' };
export const PLAN_LABEL: Record<string, string> = { any: 'Any plan', trial: 'On free trial', paid: 'Paying', ended: 'Plan ended' };
export const SCREENS: Record<string, string> = {
  Home: 'Home',
  Students: 'Students',
  Attendance: 'Attendance',
  Fees: 'Fees',
  Billing: 'Plans & billing',
  Updates: 'Updates',
};

export type Draft = {
  title: string;
  body: string;
  category: AnnCategory;
  priority: AnnPriority;
  ctaLabel: string;
  action: 'none' | 'screen' | 'link';
  screen: string;
  link: string;
  audience: 'all' | 'owners' | 'staff';
  plan: 'any' | 'trial' | 'paid' | 'ended';
  centreCategory: string;
  banner: boolean;
  push: boolean;
  when: 'now' | 'later';
  startsAt: string; // local datetime "YYYY-MM-DDTHH:mm" (IST in the dashboard's clock)
  days: string; // '1' | '7' | '30' | 'none'
};

export const EMPTY: Draft = {
  title: '',
  body: '',
  category: 'update',
  priority: 'normal',
  ctaLabel: '',
  action: 'none',
  screen: 'Home',
  link: '',
  audience: 'all',
  plan: 'any',
  centreCategory: '',
  banner: true,
  push: false,
  when: 'now',
  startsAt: '',
  days: '7',
};

/** "Tutors on a free trial · Karate centres" */
export const audienceText = (a: { audience: string; plan: string; centreCategory: string }) =>
  [WHO[a.audience] ?? a.audience, a.plan !== 'any' ? PLAN_LABEL[a.plan]?.toLowerCase() : null, a.centreCategory ? `${CATEGORY[a.centreCategory] ?? a.centreCategory} centres` : null]
    .filter(Boolean)
    .join(' · ');

