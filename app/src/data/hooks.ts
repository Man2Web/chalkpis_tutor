import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { stamp, stampYmd, type Stamp } from '../api/stamp';
import type { PlanId, PlanInfo } from '../features/billing/plans';
import type { StaffMember } from '../features/staff/api';
import { useSession } from '../features/auth/session';
import { normalizeSettings, type NotifySettings } from '../features/messages/settings';
import type { Category } from '../lib/category';
import { attendanceId, todayYmd } from '../lib/dates';
import type { AttendanceDoc, Batch, FeeDue, Mark, Payment, PayMode, Student } from '../lib/types';

/** The signed-in owner's institute. Only call inside the main app (status === 'ready'). */
export function useInstituteId(): string {
  return useSession((s) => s.profile?.instituteId) as string;
}

/** Reads every page of a list (the server returns at most 500 rows at a time). */
async function all<T>(path: string, key: string, size = 500): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += size) {
    const sep = path.includes('?') ? '&' : '?';
    const page =
      (await api<Record<string, T[]>>('GET', `${path}${sep}limit=${size}&offset=${offset}`))[key] ??
      [];
    out.push(...page);
    if (page.length < size) return out;
  }
}

// ---------- how the server's answers look to the screens ----------

type ServerBatch = Omit<Batch, 'staffUids'>;
const toBatch = (b: ServerBatch): Batch => ({ ...b, staffUids: [] });

interface ServerStudent extends Omit<Student, 'joinedAt'> {
  joinedAt: string;
}
const toStudent = (s: ServerStudent): Student => ({ ...s, joinedAt: stamp(s.joinedAt) });

interface ServerDue extends Omit<FeeDue, 'dueDate' | 'kind'> {
  dueDate: string;
  kind: 'regular' | 'charge';
}
const toDue = (d: ServerDue): FeeDue => ({
  id: d.id,
  studentId: d.studentId,
  batchId: d.batchId,
  period: d.period,
  amount: d.amount,
  discount: d.discount,
  paid: d.paid,
  status: d.status,
  dueDate: stampYmd(d.dueDate),
  description: d.description,
  ...(d.kind === 'charge' ? { kind: 'charge' as const } : {}),
  ...(d.waivedNote ? { waivedNote: d.waivedNote } : {}),
});

interface ServerPayment {
  id: string;
  studentId: string;
  dueId: string;
  amount: number;
  mode: PayMode;
  paidAt: string;
  receiptNo: string | null;
  note: string;
  balanceAfter: number | null;
  reversalOf: string | null;
  batchId: string | null;
}
const toPayment = (p: ServerPayment): Payment => ({
  id: p.id,
  studentId: p.studentId,
  dueId: p.dueId,
  amount: p.amount,
  mode: p.mode,
  paidAt: stamp(p.paidAt),
  receiptNo: p.receiptNo,
  note: p.note,
  ...(p.balanceAfter !== null ? { balanceAfter: p.balanceAfter } : {}),
  ...(p.reversalOf ? { reversalOf: p.reversalOf } : {}),
  batchId: p.batchId,
});

interface ServerDay {
  batchId: string;
  date: string;
  holiday: 'holiday' | 'cancelled' | null;
  marks: Record<string, Mark>;
}
const toAttendance = (d: ServerDay): AttendanceDoc => ({
  id: attendanceId(d.batchId, d.date),
  batchId: d.batchId,
  date: d.date,
  marks: d.marks,
  ...(d.holiday ? { holiday: true, reason: d.holiday } : {}),
});

// ---------- people and classes ----------

export function useBatches() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['batches', id],
    queryFn: async (): Promise<Batch[]> =>
      (await api<{ batches: ServerBatch[] }>('GET', '/batches?status=all')).batches.map(toBatch),
  });
}

export function useStudents() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['students', id],
    queryFn: async (): Promise<Student[]> =>
      (await all<ServerStudent>('/students?status=all', 'students')).map(toStudent),
  });
}

export interface Limits {
  studentLimit: number | null;
  batchLimit: number | null;
  activeStudentCount: number;
  batchCount: number;
  plan: string;
  /** How the running plan is paid: monthly, yearly, or null (a trial or an old pack). */
  cycle: 'month' | 'year' | null;
  status: string;
  expiresAtMs: number;
  active: boolean;
  /** An App Store / Google Play subscription that decides the plan; null for a trial or a website plan. */
  store: StoreStatus | null;
}

export interface StoreStatus {
  name: 'app_store' | 'play_store';
  product: string | null;
  willRenew: boolean;
  issue: 'billing' | 'paused' | null;
  /** When the trial or website days that resume after it end. */
  thenUntilMs: number | null;
}

export function useLimits() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['limits', id],
    queryFn: async (): Promise<Limits> => {
      const s = await api<{
        plan: string;
        cycle?: 'month' | 'year' | null;
        status: string;
        expiresAt: string;
        studentLimit: number | null;
        batchLimit: number | null;
        active: boolean;
        store?: Omit<StoreStatus, 'thenUntilMs'> & { thenUntil: string | null };
        usage: { students: number; batches: number };
      }>('GET', '/subscription');
      return {
        studentLimit: s.studentLimit,
        batchLimit: s.batchLimit,
        activeStudentCount: s.usage.students,
        batchCount: s.usage.batches,
        plan: s.plan,
        cycle: s.cycle ?? null,
        status: s.status,
        expiresAtMs: Date.parse(s.expiresAt),
        active: s.active,
        store: s.store
          ? {
              name: s.store.name,
              product: s.store.product,
              willRenew: s.store.willRenew,
              issue: s.store.issue,
              thenUntilMs: s.store.thenUntil ? Date.parse(s.store.thenUntil) : null,
            }
          : null,
      };
    },
  });
}

/** Ids of students with an unpaid or part-paid due. */
export function usePendingStudentIds() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['pendingDues', id],
    queryFn: async (): Promise<Set<string>> => {
      const o = await api<{ students: { studentId: string }[] }>('GET', '/fees/overview');
      return new Set(o.students.map((s) => s.studentId));
    },
  });
}

/** Call after writes so every list and total for this institute refreshes. */
export function useRefreshData() {
  const qc = useQueryClient();
  const id = useInstituteId();
  return () => qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === id });
}

// ---------- attendance ----------

/** The server reads at most 93 days at once; longer ranges are fetched in pieces. */
async function attendanceDays(
  from: string,
  to: string,
  batchId?: string,
): Promise<AttendanceDoc[]> {
  const out: AttendanceDoc[] = [];
  const day = 86_400_000;
  for (
    let start = Date.parse(`${from}T00:00:00Z`);
    start <= Date.parse(`${to}T00:00:00Z`);
    start += 90 * day
  ) {
    const a = new Date(start).toISOString().slice(0, 10);
    const end = Math.min(start + 89 * day, Date.parse(`${to}T00:00:00Z`));
    const b = new Date(end).toISOString().slice(0, 10);
    const q = `/attendance/range?from=${a}&to=${b}${batchId ? `&batchId=${batchId}` : ''}`;
    out.push(...(await api<{ days: ServerDay[] }>('GET', q)).days.map(toAttendance));
  }
  return out;
}

/** Every batch's attendance for one day (used for the "marked / not marked" status). */
export function useAttendanceOn(date: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['attendance', id, 'on', date],
    queryFn: () => attendanceDays(date, date),
  });
}

/** One batch's saved attendance for one day, or null. */
export function useAttendanceDoc(batchId: string, date: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['attendance', id, 'doc', batchId, date],
    queryFn: async (): Promise<AttendanceDoc | null> => {
      const d = await api<ServerDay & { saved: boolean }>(
        'GET',
        `/attendance?batchId=${batchId}&date=${date}`,
      );
      return d.saved ? toAttendance(d) : null;
    },
  });
}

/** Attendance documents in a date range (inclusive), optionally for one batch, newest day first. */
export function useAttendanceRange(from: string, to: string, batchId?: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['attendance', id, 'range', from, to, batchId ?? 'all'],
    queryFn: async (): Promise<AttendanceDoc[]> =>
      (await attendanceDays(from, to, batchId)).sort((a, b) => b.date.localeCompare(a.date)),
  });
}

export interface Institute {
  name: string;
  /** What the centre teaches, as the server stored it; read it through useCategory / toCategory. */
  category?: Category;
  logoUrl?: string | null;
  address?: string;
  phone?: string;
  upiId?: string;
  paymentLink?: string;
  receiptPrefix: string;
  /** When the centre was set up (ISO); only new centres get the welcome tour. */
  createdAt?: string;
}

export function useInstitute() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['institute', id],
    queryFn: async (): Promise<Institute> => {
      const d = await api<Institute>('GET', '/institute');
      return {
        name: d.name,
        category: d.category,
        logoUrl: d.logoUrl,
        address: d.address,
        phone: d.phone,
        upiId: d.upiId,
        paymentLink: d.paymentLink,
        receiptPrefix: d.receiptPrefix,
        createdAt: d.createdAt,
      };
    },
  });
}

// ---------- fees ----------

/** All dues that still have something to pay (pending or part-paid). */
export function useUnpaidDues() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'unpaid'],
    queryFn: async (): Promise<FeeDue[]> =>
      (await all<ServerDue>('/fees/dues?status=open', 'dues')).map(toDue),
  });
}

export function useStudentDues(studentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'student', studentId],
    queryFn: async (): Promise<FeeDue[]> =>
      (await all<ServerDue>(`/fees/dues?status=all&studentId=${studentId}`, 'dues'))
        .map(toDue)
        .sort((a, b) => b.period.localeCompare(a.period)),
  });
}

export function useStudentPayments(studentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['payments', id, 'student', studentId],
    queryFn: async (): Promise<Payment[]> =>
      (await all<ServerPayment>(`/fees/payments?studentId=${studentId}`, 'payments')).map(
        toPayment,
      ),
  });
}

export function useDue(dueId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'one', dueId],
    queryFn: async (): Promise<FeeDue | null> => {
      try {
        return toDue(await api<ServerDue>('GET', `/fees/dues/${dueId}`));
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    },
  });
}

export function usePayment(paymentId: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['payments', id, 'one', paymentId],
    queryFn: async (): Promise<Payment | null> => {
      try {
        return toPayment(await api<ServerPayment>('GET', `/fees/payments/${paymentId}`));
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    },
  });
}

const lastDayOf = (month: string) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Payments (and reversals) recorded in a month (yyyy-mm), Indian time. */
export function usePaymentsInMonth(month: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['payments', id, 'month', month],
    queryFn: async (): Promise<Payment[]> =>
      (
        await all<ServerPayment>(
          `/fees/payments?from=${month}-01&to=${lastDayOf(month)}`,
          'payments',
        )
      ).map(toPayment),
  });
}

export const usePaymentsThisMonth = () => usePaymentsInMonth(todayYmd().slice(0, 7));

/** Dues whose period is the given month (generated monthly dues and one-off charges). */
export function useDuesForPeriod(month: string) {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['dues', id, 'period', month],
    queryFn: async (): Promise<FeeDue[]> =>
      (await all<ServerDue>(`/fees/dues?status=all&period=${month}`, 'dues')).map(toDue),
  });
}

// ---------- staff ----------

/** The owner's helpers (the server refuses this to anyone else). */
export function useStaff() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['staff', id],
    queryFn: async (): Promise<StaffMember[]> =>
      (await api<{ staff: StaffMember[] }>('GET', '/staff')).staff,
  });
}

// ---------- plan, messages ----------

export interface Catalogue {
  plans: PlanInfo[];
  popular: PlanId;
  /** The store apps' first-month price for new subscribers (the store shows its own; this is for the web). */
  introMonthPaise: number;
  /** The website gateway is set up (the web app's buy buttons). */
  paymentsAvailable: boolean;
  /** Public RevenueCat keys for the phone apps; null: the apps sell nothing and show the plan only. */
  store: { ios: string | null; android: string | null } | null;
}

/** The plans and prices, from the server (owners only). */
export function useBillingCatalogue() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['billingPlans', id],
    queryFn: async (): Promise<Catalogue> => api<Catalogue>('GET', '/billing/plans'),
  });
}

export interface BillingRecord {
  id: string;
  planId: string;
  cycle: 'month' | 'year' | null;
  amountPaise: number;
  currency: string;
  refunded: boolean;
  provider: string;
  expiresAt: Stamp;
  createdAt: Stamp;
}

/** Past plan purchases, newest first. */
export function useBillingHistory() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['billing', id],
    queryFn: async (): Promise<BillingRecord[]> =>
      (
        await api<{
          history: {
            paymentId: string;
            planId: string;
            cycle?: 'month' | 'year' | null;
            amountPaise: number;
            currency?: string;
            refunded?: boolean;
            provider: string;
            expiresAt: string;
            paidAt: string;
          }[];
        }>('GET', '/billing')
      ).history.map((h) => ({
        id: h.paymentId,
        planId: h.planId,
        cycle: h.cycle ?? null,
        amountPaise: h.amountPaise,
        currency: h.currency ?? 'INR',
        refunded: !!h.refunded,
        provider: h.provider,
        expiresAt: stamp(h.expiresAt),
        createdAt: stamp(h.paidAt),
      })),
  });
}

/** The owner's parent-message choices (defaults while nothing is saved yet). */
export function useNotifySettings() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['settings', id, 'notifications'],
    queryFn: async (): Promise<NotifySettings> =>
      normalizeSettings(await api<Record<string, unknown>>('GET', '/settings/notifications')),
  });
}

export interface MessageRow {
  id: string;
  studentId: string;
  type: string;
  channel: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
  reason?: string | null;
  error?: string | null;
  toLast4?: string;
  createdAt: Stamp;
}

/** The latest 100 parent messages, newest first. */
export function useMessages() {
  const id = useInstituteId();
  return useQuery({
    queryKey: ['messages', id],
    queryFn: async (): Promise<MessageRow[]> =>
      (
        await api<{
          messages: {
            id: string;
            studentId: string;
            type: string;
            channel: string | null;
            status: MessageRow['status'];
            reason: string | null;
            error: string | null;
            toLast4: string;
            createdAt: string;
          }[];
        }>('GET', '/messages?limit=100')
      ).messages.map((m) => ({ ...m, channel: m.channel ?? '', createdAt: stamp(m.createdAt) })),
  });
}
