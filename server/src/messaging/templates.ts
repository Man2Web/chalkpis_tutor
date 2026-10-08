export type MessageType = 'absent' | 'late' | 'fee_due' | 'fee_overdue' | 'payment_received';
export type Lang = 'en' | 'hi';
export const MESSAGE_TYPES: MessageType[] = [
  'absent',
  'late',
  'fee_due',
  'fee_overdue',
  'payment_received',
];

/** { absent: { en: "1809231", hi: "..." }, ... }. Set once as the WA_TEMPLATES setting. */
export type TemplateMap = Partial<Record<MessageType, Partial<Record<Lang, string>>>>;

/** Reads the WA_TEMPLATES JSON safely; anything malformed is ignored rather than crashing a send. */
export function parseTemplates(json: string | undefined): TemplateMap {
  if (!json?.trim()) return {};
  try {
    const raw = JSON.parse(json) as Record<string, Record<string, unknown>>;
    const out: TemplateMap = {};
    for (const type of MESSAGE_TYPES) {
      const row = raw?.[type];
      if (!row || typeof row !== 'object') continue;
      for (const lang of ['en', 'hi'] as Lang[]) {
        const id = row[lang];
        if ((typeof id === 'string' || typeof id === 'number') && String(id).trim())
          (out[type] ??= {})[lang] = String(id).trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** The template id for a message in the wanted language, falling back to English. */
export const templateFor = (map: TemplateMap, type: MessageType, lang: Lang) =>
  map[type]?.[lang] ?? map[type]?.en;

export interface MessageContext {
  parent: string;
  institute: string;
  student: string;
  batch?: string;
  date?: string;
  amount?: string;
  period?: string;
  dueDate?: string;
  since?: string;
  receiptNo?: string;
  balance?: string;
}

/** WhatsApp template values must be single-line; `~` separates values for this gateway. */
export function cleanVar(v: string | undefined, max = 60): string {
  const s = (v ?? '')
    .replace(/[~\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (s || '-').slice(0, max);
}

/** Joins a (possibly long) leading part and a fixed tail, cutting only the leading part so the tail (the date, the amount) survives. */
const withTail = (head: string | undefined, tail: string, headMax = 28) =>
  `${cleanVar(head, headMax)}${tail}`;

/**
 * Values in the fixed order the templates expect (see docs/WHATSAPP-TEMPLATES.md). Every message has exactly THREE
 * variables: WhatsApp tends to reject templates that have many variables for the amount of text, so the details are
 * folded into one value. The order is {{1}} student, {{2}} details, {{3}} institute, and in EVERY template text (English
 * and Hindi) the variables appear left to right as 1, 2, 3, because template editors number them by position.
 */
export function varsFor(type: MessageType, c: MessageContext): string[] {
  const student = cleanVar(c.student);
  const institute = cleanVar(c.institute);
  const m = (details: string) => [student, cleanVar(details, 90), institute];
  switch (type) {
    case 'absent':
    case 'late':
      return m(withTail(c.batch, ` class on ${cleanVar(c.date, 20)}`));
    case 'fee_due':
      return m(
        `${cleanVar(c.amount, 20)} for ${cleanVar(c.period, 20)}, due on ${cleanVar(c.dueDate, 20)}`,
      );
    case 'fee_overdue':
      return m(
        `${cleanVar(c.amount, 20)} for ${cleanVar(c.period, 20)}, pending since ${cleanVar(c.since, 20)}`,
      );
    case 'payment_received':
      return m(
        `${cleanVar(c.amount, 20)} (receipt ${cleanVar(c.receiptNo, 20)}, balance due ${cleanVar(c.balance, 20)})`,
      );
  }
}

const IST = 'Asia/Kolkata';
const loc = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
export const ymdText = (ymd: string, lang: Lang) =>
  new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString(loc(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  });
export const rupees = (paise: number) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(paise / 100)}`;
export const periodText = (period: string, lang: Lang) =>
  new Date(`${period}-01T12:00:00Z`).toLocaleDateString(loc(lang), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Overdue reminder numbers: day 1 after the due date, then every `every` days, at most 4 in total. */
export function overdueStage(daysOverdue: number, every: number): number | null {
  if (daysOverdue < 1 || (daysOverdue - 1) % every !== 0) return null;
  const n = (daysOverdue - 1) / every;
  return n <= 3 ? n : null;
}
