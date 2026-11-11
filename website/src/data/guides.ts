/**
 * The free guides (/guides/<slug>): one question each, written for tutors and academy owners and for the search
 * engines and AI assistants they ask. Titles and descriptions are what Google and ChatGPT show; keep the question's own
 * words in them.
 */
export interface Guide {
  slug: string;
  /** Link text. */
  short: string;
  /** One line for cards. */
  blurb: string;
  title: string;
  description: string;
  h1: string;
  lead: string;
  published: string;
  modified?: string;
}

export const GUIDES: Guide[] = [
  {
    slug: 'fee-reminder-message',
    short: 'Fee reminder messages for WhatsApp',
    blurb: 'Free copy-paste templates in English, Hindi and Tamil, and a message maker.',
    title: 'Fee reminder message for WhatsApp: 8 free templates for tuition and classes',
    description:
      'Polite fee reminder messages for parents, ready to copy into WhatsApp: before the due date, due today, overdue, part payment, receipt and fee change. In English, Hindi and Tamil, with a free message maker.',
    h1: 'Fee reminder messages for WhatsApp',
    lead: 'Polite, ready-to-send fee reminders for tuition classes, coaching centres and academies. Fill in your details, copy, and send on WhatsApp.',
    published: '2026-11-11',
  },
  {
    slug: 'collect-fees-on-time',
    short: 'How to collect tuition fees on time',
    blurb: 'Ten habits that get parents to pay on time, without awkward calls.',
    title: 'How to collect tuition fees on time: 10 steps that work (India)',
    description:
      'A practical guide for tuition teachers and academy owners in India: a simple fee policy, one due date, UPI in every message, reminders before the due date, receipts for every payment and what to do when a parent does not pay.',
    h1: 'How to collect tuition fees on time',
    lead: 'Late fees are rarely about money. They are about forgetting, friction and awkwardness. Fix those three and most parents pay on time.',
    published: '2026-11-11',
  },
  {
    slug: 'choose-fee-management-app',
    short: 'How to choose a fee management app',
    blurb: 'Notebook, Excel or an app: what each costs you, and what to check.',
    title: 'Fee management app for tuition classes: how to choose (2026)',
    description:
      'Notebook, Excel, WhatsApp by hand or a fee management app? Compare the options for tuition classes and academies in India, and the 10 things to check before you pick an app.',
    h1: 'How to choose a fee management app for your class',
    lead: 'If you teach more than about 20 students, keeping fees in a notebook and chasing them on WhatsApp costs you hours every month. Here is how the options compare, and what to look for in an app.',
    published: '2026-11-11',
  },
];
