import { ApiError } from '../../../api/client';
import { staffErrorKey, staffFormError } from '../api';

describe('staffErrorKey', () => {
  it.each([
    [409, 'already_member', 'alreadyMember'],
    [402, 'staff_limit', 'staffLimit'],
    [402, 'plan_expired', 'planExpired'],
    [400, 'bad_request', 'invalid'],
    [400, 'unknown_batch', 'invalid'],
    [500, 'internal', 'generic'],
    [0, 'network', 'generic'],
  ])('%s %s -> %s', (status, code, key) =>
    expect(staffErrorKey(new ApiError(status, code))).toBe(key),
  );
  it('treats anything that is not an ApiError as generic', () => {
    expect(staffErrorKey(new Error('x'))).toBe('generic');
    expect(staffErrorKey(undefined)).toBe('generic');
  });
});

describe('staffFormError', () => {
  it('accepts a name and a valid Indian mobile number', () => {
    expect(staffFormError('Meena', '98765 43210')).toBeNull();
    expect(staffFormError('  Meena  ', '+91 98765 43210')).toBeNull();
  });
  it('rejects a short name or a bad number', () => {
    expect(staffFormError('M', '9876543210')).toBe('invalid');
    expect(staffFormError('Meena', '12345')).toBe('invalid');
    expect(staffFormError('', '')).toBe('invalid');
  });
});
