/**
 * Everything the pages link to, in one place. Facts come from the product repo: plans from
 * server/src/billing/plans.ts, the 7-day trial from server/src/config.ts (TRIAL_DAYS), store ids from app/app.json.
 */
export const SITE_URL = 'https://chalkpistutor.com';
export const SITE_NAME = 'ChalkPis Tutor';

/** The app and its sign-up flow stay on tutor.chalkpis.com. */
export const START_URL = 'https://tutor.chalkpis.com/start';
export const SIGN_IN_URL = 'https://tutor.chalkpis.com/app';
export const TERMS_URL = 'https://tutor.chalkpis.com/terms';
export const PRIVACY_URL = 'https://tutor.chalkpis.com/privacy';
export const DELETE_ACCOUNT_URL = 'https://tutor.chalkpis.com/delete-account';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=in.chalkpis.tutors';
export const APP_STORE_URL = 'https://apps.apple.com/in/app/chalkpis-class-fee-manager/id6822059424';

export const SUPPORT_EMAIL = 'hello@chalkpis.com';
/**
 * The support WhatsApp number with country code and no "+" or spaces (91 = India).
 * If it is ever emptied, every "Chat on WhatsApp" link falls back to email.
 */
export const SUPPORT_WHATSAPP = '917010473833';
export const WHATSAPP_URL = SUPPORT_WHATSAPP
  ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent('Hi, I have a question about ChalkPis Tutor')}`
  : `mailto:${SUPPORT_EMAIL}`;

export const TRIAL_DAYS = 7;

/** Google Analytics 4 property 562600019 "ChalkPis Tutor (chalkpistutor.com)". Runs in Consent Mode. */
export const GA_ID = 'G-FG0YJS71R6';
/** Meta Pixel (dataset) for the tutor ads. Loads only after "Accept all". */
export const META_PIXEL_ID = '1863203504670970';
export const COMPANY = 'M2W Technologies Private Limited';
export const SCHOOL_ERP_URL = 'https://chalkpis.com';
