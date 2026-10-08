import { batchSchema } from '../schema';

const ok = {
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['mon', 'wed'],
  startTime: '17:00',
  endTime: '18:30',
  defaultFee: '1,500',
};
const msg = (v: unknown) => {
  const r = batchSchema.safeParse(v);
  return r.success ? null : r.error.issues[0].message;
};

describe('batchSchema', () => {
  it('accepts a valid batch', () => expect(batchSchema.safeParse(ok).success).toBe(true));
  it('needs at least one day', () => expect(msg({ ...ok, days: [] })).toBe('days'));
  it('rejects bad times', () => expect(msg({ ...ok, startTime: '5pm' })).toBe('time'));
  it('rejects 24:00 and 17:60', () => {
    expect(msg({ ...ok, startTime: '24:00' })).toBe('time');
    expect(msg({ ...ok, startTime: '17:60' })).toBe('time');
  });
  it('end must be after start', () =>
    expect(msg({ ...ok, endTime: '17:00' })).toBe('endAfterStart'));
  it('rejects a bad fee', () => expect(msg({ ...ok, defaultFee: 'free' })).toBe('amount'));
});
