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
