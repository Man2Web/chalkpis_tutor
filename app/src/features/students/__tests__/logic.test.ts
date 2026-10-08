import type { Student } from '../../../lib/types';
import { distinctClasses, filterStudents, membershipDelta, remainingCapacity } from '../logic';
import { isImportable, mapImportRows, type ImportContext } from '../importRows';

const st = (id: string, name: string, extra: Partial<Student> = {}): Student => ({
  id,
  name,
  phone: '',
  parentName: '',
  parentPhone: '+919876543210',
  class: '10',
  batchIds: ['b1'],
  status: 'active',
  monthlyFee: 100000,
  feeCycle: 'monthly',
  dueDay: 1,
  notifyParent: true,
  joinedAt: {} as never,
  ...extra,
});

describe('filterStudents', () => {
  const all = [
    st('1', 'Asha Rao'),
    st('2', 'Bala K', { batchIds: ['b2'], class: '9', parentPhone: '+919000000001' }),
    st('3', 'asha Menon', { phone: '+919111111111' }),
  ];
  it('searches name case-insensitively', () =>
    expect(filterStudents(all, { search: 'ASHA' }).map((s) => s.id)).toEqual(['1', '3']));
  it('searches phone digits on student or parent, needs 3+ digits', () => {
    expect(filterStudents(all, { search: '91111' }).map((s) => s.id)).toEqual(['3']);
    expect(filterStudents(all, { search: '90000' }).map((s) => s.id)).toEqual(['2']);
    expect(filterStudents(all, { search: '9' })).toEqual([]);
  });
  it('filters by batch and class', () => {
    expect(filterStudents(all, { search: '', batchId: 'b2' }).map((s) => s.id)).toEqual(['2']);
    expect(filterStudents(all, { search: '', className: '10' }).map((s) => s.id)).toEqual([
      '1',
      '3',
    ]);
  });
  it('filters by pending fees', () => {
    expect(
      filterStudents(all, { search: '', pendingOnly: true }, new Set(['3'])).map((s) => s.id),
    ).toEqual(['3']);
  });
});

describe('helpers', () => {
  it('membershipDelta', () =>
    expect(membershipDelta(['a', 'b'], ['b', 'c'])).toEqual({ added: ['c'], removed: ['a'] }));
  it('distinctClasses sorts numerically', () =>
    expect(
      distinctClasses([
        st('1', 'a', { class: '10' }),
        st('2', 'b', { class: '9' }),
        st('3', 'c', { class: '' }),
      ]),
    ).toEqual(['9', '10']));
  it('remainingCapacity', () => {
    expect(remainingCapacity(48, 50)).toBe(2);
    expect(remainingCapacity(60, 50)).toBe(0);
    expect(remainingCapacity(5, null)).toBe(Infinity);
  });
});

describe('mapImportRows', () => {
  const ctx: ImportContext = {
    batches: [
      { id: 'b1', name: 'Maths 10', defaultFee: 150000 },
      { id: 'b2', name: 'Science 9', defaultFee: 120000 },
    ],
    defaultBatchId: 'b1',
    existing: [{ name: 'Old Student', parentPhone: '+919999999999' }],
  };
  const header = [
    'Student Name',
    'Parent Mobile',
    'Batch',
    'Monthly Fee',
    'Class',
    'Fee Cycle',
    'Due Day',
  ];

  it('maps a good row, using the named batch and its default fee', () => {
    const [r] = mapImportRows(
      [header, ['Asha', '98765 43210', 'science 9', '', '9', 'Quarterly', '5']],
      ctx,
    );
    expect(isImportable(r)).toBe(true);
    expect(r).toMatchObject({
      name: 'Asha',
      parentPhone: '+919876543210',
      batchIds: ['b2'],
      monthlyFeePaise: 120000,
      feeCycle: 'quarterly',
      dueDay: 5,
      line: 2,
    });
  });
  it('falls back to the default batch and fee', () => {
    const [r] = mapImportRows([header, ['Bala', '9876543211', '', '', '', '', '']], ctx);
    expect(r).toMatchObject({
      batchIds: ['b1'],
      monthlyFeePaise: 150000,
      feeCycle: 'monthly',
      dueDay: 1,
    });
  });
  it('reports every problem on a row', () => {
    const [r] = mapImportRows([header, ['A', '123', 'Nope', 'abc', '', 'weekly', '40']], ctx);
    expect(r.errors.sort()).toEqual(
      ['batchUnknown', 'cycle', 'dueDay', 'fee', 'name', 'parentPhone'].sort(),
    );
  });
  it('flags duplicates against existing students and within the file', () => {
    const rows = mapImportRows(
      [
        header,
        ['Old Student', '99999 99999', '', '', '', '', ''],
        ['Twin', '9876500000', '', '', '', '', ''],
        ['twin', '9876500000', '', '', '', '', ''],
      ],
      ctx,
    );
    expect(rows[0].errors).toContain('duplicate');
    expect(rows[1].errors).toEqual([]);
    expect(rows[2].errors).toContain('duplicate');
  });
  it('accepts alternative header names and returns [] with no data rows', () => {
    const [r] = mapImportRows(
      [
        ['student', 'guardian phone'],
        ['Cee', '9876500001'],
      ],
      ctx,
    );
    expect(isImportable(r)).toBe(true);
    expect(mapImportRows([header], ctx)).toEqual([]);
  });
});
