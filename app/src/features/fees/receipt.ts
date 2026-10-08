import type { Institute } from '../../data/hooks';
import { prettyDate, toYmd } from '../../lib/dates';
import { formatINR } from '../../lib/money';
import { sharePdfHtml } from '../../lib/pdf';
import type { FeeDue, Payment, Student } from '../../lib/types';
import { receiptHtml, type DocLang } from './documents';
import { netDue } from './logic';

interface Inputs {
  payment: Payment;
  student: Pick<Student, 'name'>;
  institute: Institute;
  due: FeeDue | null;
  lang: DocLang;
  modeLabel: string;
}

/** Everything a receipt shows, formatted for the chosen language. */
export function receiptVars({ payment, student, institute, due, lang, modeLabel }: Inputs) {
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  const balance = payment.balanceAfter ?? (due ? Math.max(0, netDue(due) - due.paid) : 0);
  return {
    lang,
    institute: institute.name,
    logoUrl: institute.logoUrl,
    address: institute.address,
    phone: institute.phone,
    receiptNo: payment.receiptNo ?? '',
    date: prettyDate(toYmd(payment.paidAt.toDate()), locale),
    student: student.name,
    description: due?.description ?? '',
    mode: modeLabel,
    amount: formatINR(payment.amount),
    balance: formatINR(due?.status === 'waived' ? 0 : balance),
    note: payment.note || undefined,
  };
}

/** Shares the receipt as a PDF (Android share sheet; print dialog in the browser preview). */
export function shareReceiptPdf(vars: ReturnType<typeof receiptVars>) {
  return sharePdfHtml(receiptHtml(vars), vars.receiptNo);
}
