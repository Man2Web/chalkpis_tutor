/** What a centre teaches. The app words its labels, examples and posters by it; the server only stores it. */
export const CATEGORIES = [
  'tuition',
  'coaching',
  'abacus',
  'karate',
  'dance',
  'yoga',
  'sports',
  'other',
] as const;
export type Category = (typeof CATEGORIES)[number];
