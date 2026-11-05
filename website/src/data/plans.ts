/** Mirrors server/src/billing/plans.ts. Prices in rupees; a year costs about ten months. */
export interface Plan {
  id: 'starter' | 'standard' | 'pro';
  name: string;
  month: number;
  year: number;
  students: string;
  batches: string;
  /** One line for the home page preview. */
  summary: string;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  { id: 'starter', name: 'Starter', month: 199, year: 1999, students: 'Up to 50 students', batches: 'Up to 3 batches', summary: 'Up to 50 students · 3 batches' },
  { id: 'standard', name: 'Standard', month: 299, year: 2999, students: 'Up to 100 students', batches: 'Up to 5 batches', summary: 'Up to 100 students · 5 batches', popular: true },
  { id: 'pro', name: 'Pro', month: 499, year: 4999, students: 'Unlimited students', batches: 'Unlimited batches', summary: 'Unlimited students and batches' },
];

export const rupees = (n: number) => '₹' + n.toLocaleString('en-IN');

/** "Every plan has all of this" on the pricing page. */
export const FEATURE_GROUPS = [
  { title: 'Attendance', items: ['Tap only the absent children', 'Late marks and holidays', 'Monthly register', 'Helpers take attendance for their batches'] },
  { title: 'Fees', items: ['Monthly dues and part payments', 'Yearly fees in up to four parts', 'Your own UPI QR on every reminder', 'Parents tap “I’ve paid”, you confirm'] },
  { title: 'Parents', items: ['Absent alerts and fee reminders on WhatsApp', 'Receipts sent for you', 'A private page for each child', 'One link for brothers and sisters'] },
  { title: 'Teaching', items: ['Tests, marks and report cards', 'Homework', 'Timetable and calendar', 'Enquiries and admissions'] },
  { title: 'Your centre', items: ['Poster maker for your WhatsApp status', 'Import students from Excel', 'Reports to Excel and PDF', 'Android, iPhone and your laptop'] },
];

/** Answers checked against docs/DECISIONS.md and the server code. */
export const FAQS = [
  {
    q: 'What happens when the 7-day trial ends?',
    a: 'Your data stays safe and you can still see everything in the app. To add students, take attendance and send fee updates again, choose a plan.',
  },
  {
    q: 'Are WhatsApp messages charged extra?',
    a: 'No. Absent alerts, fee reminders, receipts and the parent page link are included in every plan. So that parents are not spammed, a message you send by hand can go to the same student once every 10 minutes.',
  },
  {
    q: 'Do parents need to install anything?',
    a: 'No. Parents get updates on WhatsApp and a private web page for their child. Only you and your helpers use the app.',
  },
  {
    q: 'How do parents pay me?',
    a: 'Straight to your own UPI. Each reminder carries your QR code, and parents can tap “I’ve paid” so you can confirm it in one tap. ChalkPis never handles your fee money.',
  },
  {
    q: 'Can I change my plan later?',
    a: 'Yes. A bigger plan starts at once, and the days left on your current plan are added to it, so move up whenever you outgrow your limit. A smaller plan starts when your current one ends.',
  },
  {
    q: 'How do I pay for ChalkPis Tutor?',
    // decision 169: plans are paid on the centre's own payment page, never inside the phone apps
    a: 'On your centre’s own payment page, with UPI Autopay, any UPI app or a card through Razorpay, every month or every year. We send you the link on WhatsApp before your trial or plan ends, and you can turn auto-renew off any time.',
  },
  {
    q: 'Can my staff use it?',
    a: 'Yes. Add helpers by their WhatsApp number. They take attendance for their own batches and never see fees or parents’ phone numbers.',
  },
  {
    q: 'Can I delete my account and data?',
    a: 'Yes, any time, at tutor.chalkpis.com/delete-account.',
  },
];
