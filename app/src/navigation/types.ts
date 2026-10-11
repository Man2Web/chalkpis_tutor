export type AuthStackParams = {
  Legal: { doc: 'privacy' | 'terms' };
  Language: undefined;
  /** With a signupToken: a new Google / Apple / email person adding their mobile number once. */
  Phone: { signupToken?: string; email?: string | null; name?: string | null } | undefined;
  /** resendIn: seconds before another code may be sent (the server said the last one was too recent). */
  Otp: { phone: string; signupToken?: string; resendIn?: number };
  Email: undefined;
  EmailCode: { email: string; resendIn?: number };
};

export type OnboardingStackParams = {
  Profile: undefined;
  Batch: undefined;
  Students: { batchId: string; defaultFee: string };
};

export type MainStackParams = {
  Tabs: undefined;
  StudentForm: { id?: string; batchId?: string } | undefined;
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
  Legal: { doc: 'privacy' | 'terms' };
  Reports: undefined;
  Settings: undefined;
  EditProfile: undefined;
  PaymentSettings: undefined;
  Billing: undefined;
  NotificationSettings: undefined;
  MessageLog: undefined;
  Staff: undefined;
};
