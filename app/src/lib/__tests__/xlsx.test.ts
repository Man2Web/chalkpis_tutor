import { strFromU8, unzipSync, zipSync } from 'fflate';
import { buildXlsx, parseXlsx } from '../xlsx';

describe('xlsx', () => {
  it('reads back what it writes, including Hindi, markup characters and numbers', () => {
    const rows = [
      ['Name', 'Fee', 'Note'],
      ['राहुल <A&B> "q"', 1500.5, ''],
      ['Zoya', 0, 'x'],
    ];
    expect(parseXlsx(buildXlsx(rows, 'Fees', true))).toEqual([
      ['Name', 'Fee', 'Note'],
      ['राहुल <A&B> "q"', '1500.5', ''],
      ['Zoya', '0', 'x'],
    ]);
  });

  it('writes a real workbook with the sheet name and a bold header', () => {
    const files = unzipSync(buildXlsx([['a']], 'Fee report', true));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ]),
    );
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Fee report"');
    expect(strFromU8(files['xl/worksheets/sheet1.xml']!)).toContain('s="1"');
  });

  it('reads a file made by Excel: shared strings, rich text, gaps and blank rows', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    const zip = zipSync({
      'xl/sharedStrings.xml': enc(
        '<sst><si><t>Name</t></si><si><r><t>Par</t></r><r><t>ent</t></r></si><si><t xml:space="preserve"> Asha &amp; Co </t></si></sst>',
      ),
      'xl/worksheets/sheet1.xml': enc(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"/><row r="3"><c r="A3" t="s"><v>2</v></c><c r="C3"><v>9876543210</v></c></row></sheetData></worksheet>',
      ),
    });
    expect(parseXlsx(zip)).toEqual([
      ['Name', '', 'Parent'],
      ['Asha & Co', '', '9876543210'],
    ]);
  });

  it('refuses a file that is not a workbook', () => {
    expect(() => parseXlsx(new TextEncoder().encode('a,b\n1,2'))).toThrow();
  });
});
