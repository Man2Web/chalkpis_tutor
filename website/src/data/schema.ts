/**
 * Structured data (JSON-LD) shared by several pages. Base.astro adds the Organization (#org) and WebSite nodes to every
 * page; these helpers give the app itself and the usual page nodes. Facts only: no ratings or review counts until the
 * stores show enough real ones.
 */
import { SITE_NAME, SITE_URL, PLAY_STORE_URL, APP_STORE_URL, TRIAL_DAYS } from '../config';
import { PLANS } from './plans';

export const APP_ID = `${SITE_URL}/#app`;

/** ChalkPis Tutor as a SoftwareApplication, with every plan's monthly and yearly price. */
export function appNode() {
  return {
    '@type': 'SoftwareApplication',
    '@id': APP_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Fee collection and class management',
    operatingSystem: 'Android, iOS, Web browser',
    description:
      'Fee collection and management app for tuition classes, coaching institutes and activity academies in India: ' +
      'automatic WhatsApp fee reminders with the centre’s own UPI QR, “I’ve paid” confirmations from parents, ' +
      'numbered receipts on WhatsApp, attendance with absent alerts, tests and report cards. Parents pay the centre ' +
      `directly; no commission. Free for ${TRIAL_DAYS} days, no card needed.`,
    featureList: [
      'Automatic fee reminders on WhatsApp with your own UPI QR',
      'Parents tap “I’ve paid”; you confirm in one tap',
      'Numbered fee receipts sent on WhatsApp',
      'Part payments, advance payments and yearly fees in up to four parts',
      'Attendance with WhatsApp absent alerts to parents',
      'Tests, marks and report cards',
      'Homework, timetable and calendar',
      'Enquiries and admissions',
      'Poster maker for WhatsApp status',
      'Staff accounts that never see fees or phone numbers',
      'Import students from Excel; reports to Excel and PDF',
    ],
    screenshot: `${SITE_URL}/app/home-dashboard.webp`,
    installUrl: [PLAY_STORE_URL, APP_STORE_URL],
    inLanguage: 'en-IN',
    countriesSupported: 'IN',
    offers: PLANS.flatMap((p) => [
      {
        '@type': 'Offer',
        name: `${p.name} monthly (${p.students.toLowerCase()})`,
        price: p.month,
        priceCurrency: 'INR',
        url: `${SITE_URL}/pricing`,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: p.month, priceCurrency: 'INR', billingDuration: 'P1M' },
      },
      {
        '@type': 'Offer',
        name: `${p.name} yearly (${p.students.toLowerCase()})`,
        price: p.year,
        priceCurrency: 'INR',
        url: `${SITE_URL}/pricing`,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: p.year, priceCurrency: 'INR', billingDuration: 'P1Y' },
      },
    ]),
    publisher: { '@id': `${SITE_URL}/#org` },
  };
}

export function faqNode(items: readonly { q: string; a: string }[], url?: string) {
  return {
    '@type': 'FAQPage',
    ...(url ? { url } : {}),
    mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

/** Home → … → this page. Each crumb is [name, path]. */
export function breadcrumbNode(crumbs: [string, string][]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [[SITE_NAME, '/'] as [string, string], ...crumbs].map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: new URL(path, SITE_URL).href,
    })),
  };
}

/** A guide or article page. */
export function articleNode(o: { headline: string; description: string; path: string; published: string; modified?: string }) {
  return {
    '@type': 'Article',
    headline: o.headline,
    description: o.description,
    url: new URL(o.path, SITE_URL).href,
    mainEntityOfPage: new URL(o.path, SITE_URL).href,
    datePublished: o.published,
    dateModified: o.modified ?? o.published,
    inLanguage: 'en-IN',
    image: `${SITE_URL}/og.png`,
    author: { '@id': `${SITE_URL}/#org` },
    publisher: { '@id': `${SITE_URL}/#org` },
    about: { '@id': APP_ID },
  };
}
