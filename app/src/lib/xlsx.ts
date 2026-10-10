import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

export type Cell = string | number;

const xml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // control characters are not allowed in XML 1.0
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 0 -> A, 25 -> Z, 26 -> AA */
const colName = (i: number) => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** One-sheet .xlsx file. Numbers stay numbers, everything else is text; the first row is bold when `header` is set. */
export function buildXlsx(rows: Cell[][], sheetName = 'Sheet1', header = false): Uint8Array {
  const body = rows
    .map(
      (r, y) =>
        `<row r="${y + 1}">` +
        r
          .map((c, x) => {
            const ref = `${colName(x)}${y + 1}`;
            const s = header && y === 0 ? ' s="1"' : '';
            return typeof c === 'number' && Number.isFinite(c)
              ? `<c r="${ref}"${s}><v>${c}</v></c>`
              : `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(String(c))}</t></is></c>`;
          })
          .join('') +
        `</row>`,
    )
    .join('');
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ),
    '_rels/.rels': strToU8(
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xml(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      `${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `${head}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`,
    ),
  };
  return zipSync(files);
}

const unxml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Text of every <t> in a fragment (rich-text strings have several runs). */
const texts = (frag: string) =>
  [...frag.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1]!)).join('');

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/gi, '').toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};

/** Cell values of the first sheet as text, row by row (blank cells are ''). Never evaluates anything. */
export function parseXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, {
    filter: (f) =>
      /^xl\/(sharedStrings|worksheets\/[^/]+)\.xml$/.test(f.name) || f.name === 'xl/workbook.xml',
  });
  const read = (n: string) => (files[n] ? strFromU8(files[n]) : '');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    texts(m[1]!),
  );
  const sheetName =
    Object.keys(files)
      .filter((n) => n.startsWith('xl/worksheets/'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] ?? '';
  const out: string[][] = [];
  for (const rm of read(sheetName).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cm of rm[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!;
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const kind = /\bt="(\w+)"/.exec(attrs)?.[1];
      const inner = cm[2] ?? '';
      let v = '';
      if (kind === 's') v = shared[Number(/<v>(\d+)<\/v>/.exec(inner)?.[1])] ?? '';
      else if (kind === 'inlineStr') v = texts(inner);
      else v = unxml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '');
      const at = ref ? colIndex(ref) : row.length;
      while (row.length < at) row.push('');
      row[at] = v.trim();
    }
    out.push(row);
  }
  return out.filter((r) => r.some((f) => f !== ''));
}
