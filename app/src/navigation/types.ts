export type AuthStackParams = {
  Language: undefined;
  Phone: undefined;
  Otp: { phone: string };
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
};
