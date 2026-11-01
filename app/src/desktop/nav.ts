import type Ionicons from '@expo/vector-icons/Ionicons';
import type { MainStackParams } from '../navigation/types';

/** The places the desktop sidebar lists. */
export type Section =
  | 'home'
  | 'students'
  | 'batches'
  | 'timetable'
  | 'attendance'
  | 'tests'
  | 'homework'
  | 'enquiries'
  | 'fees'
  | 'reports'
  | 'messages'
  | 'poster'
  | 'settings'
  | 'billing'
  | 'account';

export type TabName = 'Home' | 'Students' | 'Attendance' | 'Fees' | 'Account';

export interface SectionItem {
  key: Section;
  /** i18n key of its label. */
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** A main tab, or else a screen of the main stack. */
  tab?: TabName;
  route?: keyof MainStackParams;
  /** Helpers (staff) see only these. */
  staff?: boolean;
  group: 'run' | 'grow' | 'manage';
}

export const SECTIONS: SectionItem[] = [
  { key: 'home', label: 'tabs.home', icon: 'home-outline', tab: 'Home', group: 'run' },
  {
    key: 'students',
    label: 'tabs.students',
    icon: 'people-outline',
    tab: 'Students',
    group: 'run',
  },
  {
    key: 'batches',
    label: 'batches.title',
    icon: 'albums-outline',
    route: 'Batches',
    group: 'run',
  },
  {
    key: 'timetable',
    label: 'calendar.title',
    icon: 'calendar-outline',
    route: 'Timetable',
    group: 'run',
  },
  {
    key: 'attendance',
    label: 'tabs.attendance',
    icon: 'checkmark-circle-outline',
    tab: 'Attendance',
    staff: true,
    group: 'run',
  },
  { key: 'tests', label: 'exams.title', icon: 'school-outline', route: 'Exams', group: 'run' },
  {
    key: 'homework',
    label: 'homework.title',
    icon: 'book-outline',
    route: 'Homework',
    group: 'run',
  },
  { key: 'fees', label: 'tabs.fees', icon: 'wallet-outline', tab: 'Fees', group: 'run' },
  {
    key: 'reports',
    label: 'reports.title',
    icon: 'bar-chart-outline',
    route: 'Reports',
    group: 'run',
  },
  {
    key: 'enquiries',
    label: 'enquiries.title',
    icon: 'person-add-outline',
    route: 'Enquiries',
    group: 'grow',
  },
  {
    key: 'messages',
    label: 'messages.logTitle',
    icon: 'chatbubbles-outline',
    route: 'MessageLog',
    group: 'grow',
  },
  { key: 'poster', label: 'poster.title', icon: 'image-outline', route: 'Poster', group: 'grow' },
  {
    key: 'settings',
    label: 'settings.instituteTitle',
    icon: 'settings-outline',
    route: 'Settings',
    group: 'manage',
  },
  {
    key: 'billing',
    label: 'billing.title',
    icon: 'card-outline',
    route: 'Billing',
    group: 'manage',
  },
  {
    key: 'account',
    label: 'tabs.account',
    icon: 'person-circle-outline',
    tab: 'Account',
    staff: true,
    group: 'manage',
  },
];

/** What a helper or an owner sees in the sidebar, in order. */
export const sectionsFor = (staff: boolean) => SECTIONS.filter((s) => !staff || s.staff);

const TAB_SECTION: Record<TabName, Section> = {
  Home: 'home',
  Students: 'students',
  Attendance: 'attendance',
  Fees: 'fees',
  Account: 'account',
};

/** Which sidebar place a screen opened on top of the tabs belongs to, so the sidebar keeps it lit. */
const ROUTE_SECTION: Partial<Record<keyof MainStackParams, Section>> = {
  StudentForm: 'students',
  StudentProfile: 'students',
  StudentImport: 'students',
  Batches: 'batches',
  BatchForm: 'batches',
  BatchDetail: 'batches',
  MarkAttendance: 'attendance',
  AttendanceReport: 'attendance',
  Exams: 'tests',
  ExamForm: 'tests',
  ExamMarks: 'tests',
  Homework: 'homework',
  HomeworkForm: 'homework',
  HomeworkCheck: 'homework',
  Enquiries: 'enquiries',
  EnquiryForm: 'enquiries',
  Enquiry: 'enquiries',
  Timetable: 'timetable',
  EventForm: 'timetable',
  FeeLedger: 'fees',
  CollectFee: 'fees',
  Receipt: 'fees',
  FeePlan: 'fees',
  Reminder: 'fees',
  AdvancePayment: 'fees',
  Reports: 'reports',
  MessageLog: 'messages',
  NotificationSettings: 'messages',
  Poster: 'poster',
  Settings: 'settings',
  PaymentSettings: 'settings',
  Staff: 'settings',
  Billing: 'billing',
  EditProfile: 'account',
  AddPhone: 'account',
  Legal: 'account',
  Updates: 'home',
};

/**
 * The lit sidebar place for the main stack: the screen on top, or the focused tab when the tabs are on top. A screen
 * the map does not know keeps the tab's place.
 */
export function sectionOf(topRoute: string | undefined, focusedTab: string | undefined): Section {
  const fromTab = TAB_SECTION[focusedTab as TabName] ?? 'home';
  if (!topRoute || topRoute === 'Tabs') return fromTab;
  return ROUTE_SECTION[topRoute as keyof MainStackParams] ?? fromTab;
}
