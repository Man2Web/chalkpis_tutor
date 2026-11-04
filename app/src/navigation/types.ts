export type AuthStackParams = {
  Legal: { doc: 'privacy' | 'terms' };
  Language: undefined;
  Phone: undefined;
  /** resendIn: seconds before another code may be sent (the server said the last one was too recent). */
  Otp: { phone: string; resendIn?: number };
};

export type OnboardingStackParams = {
  Profile: undefined;
  /** The owner's email, city, state, PIN code and how they heard about Chalkpis (decision 156). */
  Details: undefined;
  Batch: undefined;
  Students: { batchId: string; defaultFee: string };
};

export type MainStackParams = {
  Tabs: undefined;
  /** `siblingOf`: a new brother or sister of that student, with the parent filled in (decision 155). */
  StudentForm: { id?: string; batchId?: string; siblingOf?: string } | undefined;
  StudentProfile: { id: string };
  StudentImport: { mode: 'csv' | 'contacts' };
  Batches: undefined;
  BatchForm: { id?: string } | undefined;
  BatchDetail: { id: string };
  MarkAttendance: { batchId: string; date: string };
  AttendanceReport: undefined;
  FeeLedger: { studentId: string };
  CollectFee: { dueId: string };
  Receipt: { paymentId: string };
  FeePlan: { studentId: string };
  Reminder: { studentId: string };
  AdvancePayment: { studentId: string };
  Poster: undefined;
  /** Tests & marks (decision 151). */
  Exams: undefined;
  ExamForm: { id?: string; batchId?: string } | undefined;
  ExamMarks: { id: string };
  /** Homework (decision 152). */
  Homework: undefined;
  HomeworkForm: { id?: string; batchId?: string } | undefined;
  HomeworkCheck: { id: string };
  /** Enquiries and admissions (decision 153). */
  Enquiries: undefined;
  EnquiryForm: { id?: string } | undefined;
  Enquiry: { id: string };
  /** Timetable and calendar (decision 154). `date` starts a new event on that day. */
  Timetable: undefined;
  EventForm: { id?: string; date?: string } | undefined;
  Legal: { doc: 'privacy' | 'terms' };
  Reports: undefined;
  Settings: undefined;
  EditProfile: undefined;
  /** The owner's basic details (decision 156). `prompt`: the request an older centre gets on opening the app. */
  OwnerDetails: { from: 'prompt' | 'card' | 'profile' } | undefined;
  /** Adds a mobile number to an older account that has none. */
  AddPhone: undefined;
  PaymentSettings: undefined;
  Billing: undefined;
  NotificationSettings: undefined;
  MessageLog: undefined;
  Staff: undefined;
  /** Announcements from Chalkpis, newest first (the bell on Home, or a tapped push). */
  Updates: undefined;
};
