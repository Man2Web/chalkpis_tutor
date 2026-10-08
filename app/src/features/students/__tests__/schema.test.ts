import { studentSchema } from '../schema';

const ok = {
  name: 'Asha Rao',
  phone: '',
  parentName: '',
  parentPhone: '98765 43210',
  class: '',
  monthlyFee: '1500',
  feeCycle: 'monthly' as const,
  dueDay: 1,
  notifyParent: true,
};
const msg = (v: unknown) => {
  const r = studentSchema.safeParse(v);
  return r.success ? null : r.error.issues[0].message;
};

describe('studentSchema', () => {
  it('accepts the minimum fields (student phone optional)', () => expect(msg(ok)).toBeNull());
  it('needs a valid parent phone', () => expect(msg({ ...ok, parentPhone: '123' })).toBe('phone'));
  it('validates student phone only when given', () => {
    expect(msg({ ...ok, phone: '12' })).toBe('phone');
    expect(msg({ ...ok, phone: '98765 43211' })).toBeNull();
  });
  it('needs a name and a valid fee and due day', () => {
    expect(msg({ ...ok, name: 'A' })).toBe('required');
    expect(msg({ ...ok, monthlyFee: '-1' })).toBe('amount');
    expect(studentSchema.safeParse({ ...ok, dueDay: 32 }).success).toBe(false);
  });
});
