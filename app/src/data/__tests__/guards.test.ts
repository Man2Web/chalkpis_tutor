import { limitBlock } from '../guards';

jest.mock('../hooks', () => ({ useLimits: jest.fn() }));

const base = {
  studentLimit: 50,
  batchLimit: 3,
  activeStudentCount: 10,
  batchCount: 1,
  active: true,
};

describe('limitBlock', () => {
  it('allows when under the limit', () => {
    expect(limitBlock(base, 'student')).toBeNull();
    expect(limitBlock(base, 'batch')).toBeNull();
  });
  it('blocks exactly at the limit', () => {
    expect(limitBlock({ ...base, activeStudentCount: 50 }, 'student')).toEqual({
      kind: 'student',
      limit: 50,
    });
    expect(limitBlock({ ...base, batchCount: 3 }, 'batch')).toEqual({ kind: 'batch', limit: 3 });
  });
  it('trial / pro (null limits) never block on count', () => {
    expect(
      limitBlock({ ...base, studentLimit: null, activeStudentCount: 5000 }, 'student'),
    ).toBeNull();
  });
  it('an expired plan blocks everything', () => {
    expect(limitBlock({ ...base, active: false }, 'student')).toEqual({ kind: 'expired' });
    expect(limitBlock({ ...base, active: false }, 'batch')).toEqual({ kind: 'expired' });
  });
  it('allows while limits are still loading', () =>
    expect(limitBlock(undefined, 'student')).toBeNull());
});
