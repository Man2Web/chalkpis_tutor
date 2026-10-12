import type Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useInstitute } from '../data/hooks';

/**
 * What a centre teaches. Picked when the centre is set up (and changeable in Settings); the app words its labels,
 * examples and posters by it, from the texts under `categories.<category>.*` in en.json.
 */
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

export const CATEGORY_ICON: Record<Category, keyof typeof Ionicons.glyphMap> = {
  tuition: 'book',
  coaching: 'school',
  abacus: 'calculator',
  karate: 'hand-left',
  dance: 'musical-notes',
  yoga: 'flower',
  sports: 'football',
  other: 'apps',
};

/** Anything the server sends that is not a known category reads as tuition (every centre was, before categories). */
export const toCategory = (v: unknown): Category =>
  (CATEGORIES as readonly unknown[]).includes(v) ? (v as Category) : 'tuition';

/**
 * This centre's category and `ct(key)`, its text for that key: e.g. ct('level') is "Class" for tuition and "Belt"
 * for karate. Tuition until the institute has loaded.
 */
export function useCategory() {
  const { t } = useTranslation();
  const category = toCategory(useInstitute().data?.category);
  const ct = (key: string, opts?: Record<string, unknown>) =>
    t(`categories.${category}.${key}`, opts ?? {});
  return { category, ct };
}
