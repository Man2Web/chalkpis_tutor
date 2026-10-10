import { gridFor, initials, wrapText } from '../layout';

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
  it('makes initials', () => {
    expect(initials('asha rao kumar')).toBe('AR');
    expect(initials(' ')).toBe('?');
  });
});
