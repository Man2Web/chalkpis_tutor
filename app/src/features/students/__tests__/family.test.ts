import type { Student } from '../../../lib/types';
import { linkCandidates, siblingsOf, siblingSuggestions } from '../family';

const kid = (over: Partial<Student>): Student =>
  ({
    id: 'x',
    name: 'X',
    phone: '',
    parentName: 'Meena',
    parentPhone: '+919876500001',
    class: '5',
    status: 'active',
    batchIds: [],
    monthlyFee: 0,
    feeCycle: 'monthly',
    dueDay: 1,
    notifyParent: true,
    familyId: null,
    ...over,
  }) as Student;

const asha = kid({ id: 'a', name: 'Asha', familyId: 'f1' });
const meera = kid({ id: 'm', name: 'Meera', familyId: 'f1' });
const ravi = kid({ id: 'r', name: 'Ravi', class: '8' });
const old = kid({ id: 'o', name: 'Old', status: 'inactive' });
const other = kid({ id: 'z', name: 'Zara', parentPhone: '+919876500002' });
const all = [ravi, meera, asha, old, other];

describe('brothers and sisters', () => {
  it('lists the linked ones only', () => {
    expect(siblingsOf(all, asha).map((s) => s.id)).toEqual(['m']);
    expect(siblingsOf(all, ravi)).toEqual([]);
  });

  it('suggests active children with the same number, outside the family', () => {
    expect(siblingSuggestions(all, '+919876500001').map((s) => s.id)).toEqual(['a', 'm', 'r']);
    expect(siblingSuggestions(all, '+919876500001', asha).map((s) => s.id)).toEqual(['r']);
    expect(siblingSuggestions(all, '+919876500009')).toEqual([]);
    expect(siblingSuggestions(all, null)).toEqual([]);
  });

  it('offers everyone else to link, the same number and active first, with search', () => {
    expect(linkCandidates(all, asha, '').map((s) => s.id)).toEqual(['r', 'o', 'z']);
    expect(linkCandidates(all, ravi, '').map((s) => s.id)).toEqual(['a', 'm', 'o', 'z']);
    expect(linkCandidates(all, ravi, 'zar').map((s) => s.id)).toEqual(['z']);
    expect(linkCandidates(all, asha, '8').map((s) => s.id)).toEqual(['r']);
  });
});
