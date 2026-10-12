import en from '../../i18n/en.json';
import { CATEGORIES, CATEGORY_ICON, toCategory } from '../category';

describe('centre categories', () => {
  it('every category has every text the app asks for, and an icon', () => {
    const keys = Object.keys(en.categories.tuition).sort();
    for (const c of CATEGORIES) {
      expect(Object.keys(en.categories[c]).sort()).toEqual(keys);
      for (const k of keys) expect((en.categories[c] as Record<string, string>)[k]).toBeTruthy();
      expect(CATEGORY_ICON[c]).toBeTruthy();
    }
  });

  it('shows a level the way each centre writes it', () => {
    expect(en.categories.tuition.levelValue).toBe('Class {{n}}');
    expect(en.categories.karate.level).toBe('Belt');
    expect(en.categories.karate.levelValue).toBe('{{n}}');
  });

  it('reads anything unknown (an older server, a missing value) as tuition', () => {
    expect(toCategory('yoga')).toBe('yoga');
    expect(toCategory(undefined)).toBe('tuition');
    expect(toCategory('chess')).toBe('tuition');
  });
});
