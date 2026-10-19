import { academicYear, addMonths, partsError, splitYearly } from '../plan';

describe('yearly fee plan defaults', () => {
  it('names the academic year (April to March)', () => {
    expect(academicYear('2026-10-19')).toBe('2026-27');
    expect(academicYear('2026-04-01')).toBe('2026-27');
    expect(academicYear('2027-03-31')).toBe('2026-27');
    expect(academicYear('2099-06-01')).toBe('2099-00');
  });

  it('adds months, keeping the day where the month allows', () => {
    expect(addMonths('2026-10-10', 4)).toBe('2027-02-10');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 0)).toBe('2026-12-15');
  });

  it('splits in whole rupees, the remainder on the first part, spread over the year', () => {
    expect(splitYearly(2400000, 3, '2026-06-10')).toEqual([
      { amount: 800000, dueYmd: '2026-06-10' },
      { amount: 800000, dueYmd: '2026-10-10' },
      { amount: 800000, dueYmd: '2027-02-10' },
    ]);
    const odd = splitYearly(1000050, 3, '2026-06-10'); // ₹10,000.50
    expect(odd.map((p) => p.amount)).toEqual([333450, 333300, 333300]);
    expect(odd.reduce((s, p) => s + p.amount, 0)).toBe(1000050);
    expect(splitYearly(1200000, 2, '2026-06-01').map((p) => p.dueYmd)).toEqual([
      '2026-06-01',
      '2026-12-01',
    ]);
    expect(splitYearly(1200000, 4, '2026-06-01').map((p) => p.dueYmd)).toEqual([
      '2026-06-01',
      '2026-09-01',
      '2026-12-01',
      '2027-03-01',
    ]);
    expect(splitYearly(500000, 1, '2026-06-01')).toEqual([
      { amount: 500000, dueYmd: '2026-06-01' },
    ]);
  });

  it('says what is wrong with the parts', () => {
    const ok = { amount: 100, dueYmd: '2026-06-01' };
    expect(partsError([ok, { amount: 100, dueYmd: '2026-09-01' }])).toBeNull();
    expect(partsError([ok, { amount: 0, dueYmd: '2026-09-01' }])).toBe('amount');
    expect(partsError([ok, { amount: null, dueYmd: '2026-09-01' }])).toBe('amount');
    expect(partsError([ok, { amount: 100, dueYmd: '2026-02-30' }])).toBe('date');
    expect(partsError([ok, { amount: 100, dueYmd: '1/9/2026' }])).toBe('date');
    expect(partsError([{ amount: 100, dueYmd: '2026-09-01' }, ok])).toBe('order');
  });
});
