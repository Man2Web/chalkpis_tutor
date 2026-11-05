import { fitText, gridFor, initials, wrapText } from '../layout';

describe('poster layout', () => {
  it('wraps at spaces, keeps the line limit and marks dropped text', () => {
    expect(wrapText('Admissions open for Class 9 and 10', 16, 3)).toEqual([
      'Admissions open',
      'for Class 9 and',
      '10',
    ]);
    expect(wrapText('one two three four five six', 9, 2)).toEqual(['one two', 'three…']);
    expect(wrapText('Supercalifragilistic', 8, 2)).toEqual(['Superca…']);
    expect(wrapText('   ', 10, 2)).toEqual([]);
  });
  it('lays out up to six toppers', () => {
    expect([0, 1, 3, 4, 5, 6, 9].map(gridFor)).toEqual([
      { cols: 0, rows: 0 },
      { cols: 1, rows: 1 },
      { cols: 3, rows: 1 },
      { cols: 2, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
      { cols: 3, rows: 2 },
    ]);
  });
  it('fits a name into its card: full size when short, smaller when long, two lines when very long', () => {
    expect(fitText('Asha', 288, 44, 28)).toEqual({ lines: ['Asha'], size: 44 });
    const mid = fitText('Ananya Krishnan', 288, 44, 28);
    expect(mid.lines).toEqual(['Ananya Krishnan']);
    expect(mid.size).toBeLessThan(44);
    expect(mid.size * 0.62 * 'Ananya Krishnan'.length).toBeLessThanOrEqual(288);
    const long = fitText('Venkatanarasimha Raju', 288, 44, 28);
    expect(long.lines).toEqual(['Venkatanarasimha', 'Raju']);
    expect(long.size).toBeGreaterThanOrEqual(28);
    for (const line of long.lines) expect(line.length * 0.62 * long.size).toBeLessThanOrEqual(288);
    expect(fitText('  ', 288, 44, 28).lines).toEqual([]);
  });
  it('makes initials', () => {
    expect(initials('asha rao kumar')).toBe('AR');
    expect(initials(' ')).toBe('?');
  });
});
