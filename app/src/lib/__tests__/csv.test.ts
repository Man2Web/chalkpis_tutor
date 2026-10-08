import { csvCell, parseCsv, toCsv } from '../csv';

describe('parseCsv', () => {
  it('parses simple rows and trims', () => {
    expect(parseCsv('a, b ,c\n1,2,3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('handles quotes, embedded commas, newlines and escaped quotes', () => {
    expect(parseCsv('n,note\n"Rao, Asha","said ""hi""\nthere"')).toEqual([
      ['n', 'note'],
      ['Rao, Asha', 'said "hi"\nthere'],
    ]);
  });
  it('handles CRLF, BOM and blank lines', () => {
    expect(parseCsv('﻿a,b\r\n\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('detects semicolons (Excel in some locales)', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('keeps empty trailing fields', () => {
    expect(parseCsv('a,b,c\n1,,')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', ''],
    ]);
  });
  it('returns nothing for empty input', () => expect(parseCsv('')).toEqual([]));
});

describe('csv output', () => {
  it('escapes only when needed', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "x"')).toBe('"say ""x"""');
  });
  it('round-trips', () => {
    const rows = [
      ['name', 'note'],
      ['Rao, A', 'q"uote'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
