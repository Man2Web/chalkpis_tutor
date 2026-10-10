import type { Stamp } from '../api/stamp';

/** A point in time with .toDate() and .toMillis() (see api/stamp.ts). */
export type Timestamp = Stamp;

export interface UserProfile {
  name: string;
  phone: string;
  email?: string;
  language: 'en' | 'hi';
  instituteId?: string;
  role: 'owner' | 'staff';
  onboardingDone?: boolean;
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export interface Batch {
  id: string;
  name: string;
  subject: string;
  class: string;
  days: Weekday[];
  startTime: string; // HH:MM 24h
  endTime: string;
  defaultFee: number; // paise
  status: 'active' | 'archived';
  staffUids: string[];
  studentCount: number;
}

export type FeeCycle = 'monthly' | 'quarterly' | 'one-time';

export interface Student {
  id: string;
  name: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  class: string;
  photoUrl?: string | null;
  joinedAt: Timestamp;
  status: 'active' | 'inactive';
  batchIds: string[];
  monthlyFee: number; // paise
  feeCycle: FeeCycle;
  dueDay: number;
  discount?: number; // paise per period
  notifyParent: boolean;
  notes?: string;
  dob?: string; // yyyy-mm-dd or ''
  gender?: '' | 'male' | 'female' | 'other';
}

export type Mark = 'P' | 'A' | 'L';

export interface AttendanceDoc {
  id: string;
  batchId: string;
  date: string; // yyyy-mm-dd (Indian time)
  marks: Record<string, Mark>; // studentId -> P/A/L
  holiday?: boolean; // holiday or class cancelled: excluded from percentages
  reason?: 'holiday' | 'cancelled';
}

/** Students below this attendance percentage are flagged. */
export const LOW_ATTENDANCE_PERCENT = 75;

export type DueStatus = 'pending' | 'partial' | 'paid' | 'waived';

export interface FeeDue {
  id: string; // studentId_yyyy-mm for generated dues
  studentId: string;
  batchId?: string | null;
  period: string; // yyyy-mm
  amount: number; // paise, before discount
  discount: number; // paise
  paid: number; // paise, net of reversals
  status: DueStatus;
  dueDate: Timestamp;
  description: string;
  kind?: 'charge'; // one-off charge (admission, books)
  waivedNote?: string;
}

export type PayMode = 'cash' | 'upi' | 'bank' | 'other';
export const PAY_MODES: PayMode[] = ['cash', 'upi', 'bank', 'other'];

export interface Payment {
  id: string;
  studentId: string;
  dueId: string;
  amount: number; // paise; negative = reversing entry
  mode: PayMode;
  paidAt: Timestamp;
  receiptNo: string | null; // null on reversals
  note?: string;
  recordedBy?: string;
  reversalOf?: string; // id of the payment this entry reverses
  balanceAfter?: number; // paise still owed on the due right after this payment
  batchId?: string | null; // batch of the due, for per-batch collection reports
}
