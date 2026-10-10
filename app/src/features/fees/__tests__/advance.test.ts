import { advanceMonths, advanceTotal } from '../advance';

describe('advance payment helpers', () => {
  it('offers this month and the next 12, across the year end', () => {
    const m = advanceMonths('2026-10-10');
    expect(m[0]).toBe('2026-10');
    expect(m[3]).toBe('2027-01');
    expect(m).toHaveLength(13);
    expect(m[12]).toBe('2027-10');
  });
  it('adds the fee less discount for new months and what is left on existing ones', () => {
    expect(
      advanceTotal(['2026-10', '2026-11', '2026-12'], { monthly: 150000, discount: 10000 }, [
        { period: '2026-10', owe: 50000 },
      ]),
    ).toBe(50000 + 140000 + 140000);
    expect(advanceTotal([], { monthly: 1, discount: 0 }, [])).toBe(0);
  });
});
