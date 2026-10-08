import en from '../en.json';
import hi from '../hi.json';

const keys = (o: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );

describe('translations', () => {
  it('Hindi has exactly the same keys as English', () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
  });
  it('placeholders match in every string', () => {
    const flat = (o: Record<string, unknown>, p = ''): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : [[`${p}${k}`, String(v)] as [string, string]],
      );
    const hiMap = new Map(flat(hi));
    for (const [key, text] of flat(en)) {
      const ph = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort().join();
      expect(ph(hiMap.get(key) ?? '')).toBe(ph(text));
    }
  });
});
