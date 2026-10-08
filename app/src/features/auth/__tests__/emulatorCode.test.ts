import { latestCode } from '../EmulatorCodeHint';

describe('latestCode', () => {
  const body = {
    verificationCodes: [
      { phoneNumber: '+917010473833', code: '111111' },
      { phoneNumber: '+919876543210', code: '222222' },
      { phoneNumber: '+917010473833', code: '333333' },
    ],
  };
  it('returns the newest code for that phone only', () => {
    expect(latestCode(body, '+917010473833')).toBe('333333');
    expect(latestCode(body, '+919876543210')).toBe('222222');
  });
  it('returns null when nothing matches', () => {
    expect(latestCode(body, '+910000000000')).toBeNull();
    expect(latestCode({}, '+917010473833')).toBeNull();
  });
});
