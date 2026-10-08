import { DEFAULT_SETTINGS, clampDays, normalizeSettings, reasonKey } from '../settings';

describe('normalizeSettings', () => {
  it('starts with messages OFF and sensible choices', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      enabled: false,
      feeDueDaysBefore: 2,
      overdueEveryDays: 7,
      language: 'en',
    });
  });
  it('keeps valid values and repairs bad ones', () => {
    expect(
      normalizeSettings({
        enabled: true,
        late: false,
        feeDueDaysBefore: 40,
        overdueEveryDays: 0,
        language: 'hi',
        absent: 'no',
      }),
    ).toMatchObject({
      enabled: true,
      late: false,
      absent: true,
      feeDueDaysBefore: 15,
      overdueEveryDays: 1,
      language: 'hi',
    });
    expect(normalizeSettings({ feeDueDaysBefore: Number.NaN, language: 'fr' })).toMatchObject({
      feeDueDaysBefore: 2,
      language: 'en',
    });
  });
});

it('clampDays keeps steppers inside the server limits', () => {
  expect(clampDays('feeDueDaysBefore', -1)).toBe(0);
  expect(clampDays('feeDueDaysBefore', 16)).toBe(15);
  expect(clampDays('overdueEveryDays', 0)).toBe(1);
  expect(clampDays('overdueEveryDays', 31)).toBe(30);
  expect(clampDays('overdueEveryDays', 9.6)).toBe(10);
});

it('reasonKey explains known reasons and leaves provider codes alone', () => {
  expect(reasonKey('not-configured')).toBe('messages.reason.not-configured');
  expect(reasonKey('bad-phone')).toBe('messages.reason.bad-phone');
  expect(reasonKey('http-401')).toBeNull();
  expect(reasonKey(null)).toBeNull();
});
