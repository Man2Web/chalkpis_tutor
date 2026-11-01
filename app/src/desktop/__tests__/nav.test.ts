import { SECTIONS, sectionOf, sectionsFor } from '../nav';

describe('desktop sidebar', () => {
  it('lights the focused tab while the tabs are on top', () => {
    expect(sectionOf('Tabs', 'Fees')).toBe('fees');
    expect(sectionOf(undefined, 'Students')).toBe('students');
    expect(sectionOf('Tabs', undefined)).toBe('home');
  });

  it('keeps a screen opened on top of the tabs under its own place', () => {
    expect(sectionOf('StudentProfile', 'Home')).toBe('students');
    expect(sectionOf('CollectFee', 'Students')).toBe('fees');
    expect(sectionOf('MarkAttendance', 'Home')).toBe('attendance');
    expect(sectionOf('BatchDetail', 'Attendance')).toBe('batches');
    expect(sectionOf('PaymentSettings', 'Fees')).toBe('settings');
    expect(sectionOf('EventForm', 'Home')).toBe('timetable');
  });

  it('falls back to the tab for a screen it does not know', () => {
    expect(sectionOf('SomethingNew', 'Attendance')).toBe('attendance');
  });

  it('shows a helper only attendance and their account', () => {
    expect(sectionsFor(true).map((s) => s.key)).toEqual(['attendance', 'account']);
    expect(sectionsFor(false)).toHaveLength(SECTIONS.length);
  });

  it('opens every place either as a tab or as a screen, never both', () => {
    for (const s of SECTIONS) expect(Number(!!s.tab) + Number(!!s.route)).toBe(1);
  });
});
