import {
  Activity,
  AlertTriangle,
  Building2,
  CalendarCheck,
  IndianRupee,
  LogIn,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

/** Event kinds in feeds: icon, tint classes and the chip label. */
export const KIND: Record<string, { icon: LucideIcon; tint: string; label: string }> = {
  signup: { icon: Sparkles, tint: 'bg-violet-500/12 text-violet-600 dark:text-violet-300', label: 'Sign-ups' },
  login: { icon: LogIn, tint: 'bg-sky-500/12 text-sky-600 dark:text-sky-300', label: 'Logins' },
  activity: { icon: Activity, tint: 'bg-violet-500/12 text-violet-600 dark:text-violet-300', label: 'Changes' },
  centre: { icon: Building2, tint: 'bg-teal-500/12 text-teal-600 dark:text-teal-300', label: 'New centres' },
  payment: { icon: IndianRupee, tint: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', label: 'Payments' },
  reversal: { icon: RotateCcw, tint: 'bg-amber-500/12 text-amber-600 dark:text-amber-300', label: 'Corrections' },
  attendance: { icon: CalendarCheck, tint: 'bg-sky-500/12 text-sky-600 dark:text-sky-300', label: 'Attendance' },
  message: { icon: MessageCircle, tint: 'bg-teal-500/12 text-teal-600 dark:text-teal-300', label: 'WhatsApp sent' },
  'message-failed': { icon: AlertTriangle, tint: 'bg-rose-500/12 text-rose-600 dark:text-rose-300', label: 'WhatsApp failures' },
  plan: { icon: Trophy, tint: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300', label: 'Plans' },
  admin: { icon: ShieldCheck, tint: 'bg-muted text-muted-foreground', label: 'Admin' },
};
export const kindOf = (k: string) => KIND[k] ?? KIND.admin;

export const METHOD: Record<string, string> = {
  whatsapp: 'WhatsApp',
  google: 'Google',
  apple: 'Apple',
  email: 'Email',
};
export const DEVICE: Record<string, string> = { ios: 'iPhone', android: 'Android', web: 'Web' };
export const NOPHONE = 'No phone (Apple)';

export const CATEGORY: Record<string, string> = {
  tuition: 'Tuition',
  coaching: 'Coaching',
  abacus: 'Abacus',
  karate: 'Karate',
  dance: 'Dance',
  yoga: 'Yoga',
  sports: 'Sports',
  other: 'Other',
};
export const category = (c?: string | null) => CATEGORY[c ?? ''] ?? 'Tuition';

export const TAGS = ['vip', 'follow-up', 'churn-risk', 'onboarding', 'partner', 'test'] as const;
export const tagLabel = (t: string) => t.replace('-', ' ');
export const TAG_TONE: Record<string, string> = {
  vip: 'bg-yellow-400/20 text-yellow-800 dark:text-yellow-300 border-yellow-500/30',
  'follow-up': 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25',
  'churn-risk': 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
  onboarding: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  partner: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25',
  test: 'bg-muted text-muted-foreground',
};

export const AREA: Record<string, { label: string; color: string }> = {
  student: { label: 'Students', color: 'var(--chart-1)' },
  batch: { label: 'Batches', color: 'var(--chart-4)' },
  attendance: { label: 'Attendance', color: '#14b8a6' },
  fee: { label: 'Fees', color: 'var(--chart-2)' },
  message: { label: 'WhatsApp', color: '#0d9488' },
  settings: { label: 'Settings', color: '#a3a3a3' },
  staff: { label: 'Helpers', color: 'var(--chart-3)' },
  parent: { label: 'Parent links', color: '#3b82f6' },
  centre: { label: 'Setup', color: '#a3a3a3' },
  billing: { label: 'Plan', color: '#10b981' },
};

export const AUDIT: Record<string, { label: string; tone: Tone }> = {
  block: { label: 'Blocked', tone: 'red' },
  unblock: { label: 'Unblocked', tone: 'green' },
  'sign-out': { label: 'Signed out', tone: 'orange' },
  'set-plan': { label: 'Plan changed', tone: 'green' },
  announce: { label: 'Announcement', tone: 'blue' },
  'end-announcement': { label: 'Announcement ended', tone: 'blue' },
  'retry-message': { label: 'Message retried', tone: 'blue' },
};

export type Tone = 'green' | 'red' | 'orange' | 'blue' | 'neutral';
export const TONE: Record<Tone, string> = {
  green: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  red: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
  orange: 'bg-amber-500/14 text-amber-700 dark:text-amber-300 border-amber-500/25',
  blue: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25',
  neutral: 'bg-muted text-muted-foreground',
};

export const MESSAGE_TYPES: Record<string, string> = {
  absent: 'Absent',
  late: 'Late',
  fee_due: 'Fee due',
  fee_overdue: 'Fee overdue',
  fee_reminder: 'Reminder · QR',
  fee_link: 'Reminder · link',
  payment_received: 'Receipt',
  parent_link: 'Parent link',
  student_welcome: 'Welcome',
  class_cancelled: 'Class cancelled',
};
export const msgType = (t: string) => MESSAGE_TYPES[t] ?? t.replace(/_/g, ' ');

export const PLAN_COLOR: Record<string, string> = {
  trial: 'var(--chart-1)',
  starter: '#14b8a6',
  standard: 'var(--chart-4)',
  pro: 'var(--chart-2)',
};
