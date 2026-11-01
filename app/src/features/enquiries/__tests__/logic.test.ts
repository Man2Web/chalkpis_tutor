import { conversion, followUpLabel, quickFollowUps, stageTone, welcomeMessage } from '../logic';

const t = (key: string, o: Record<string, unknown> = {}) =>
  `${key}${Object.entries(o)
    .map(([k, v]) => ` ${k}=${String(v)}`)
    .join('')}`;
const dateText = (ymd: string) => `<${ymd}>`;

describe('enquiries', () => {
  it('says when the next follow-up is', () => {
    const today = '2026-11-01';
    expect(followUpLabel(t, null, today, dateText)).toBeNull();
    expect(followUpLabel(t, '2026-10-30', today, dateText)).toEqual({
      text: 'enquiries.followOverdue',
      tone: 'danger',
    });
    expect(followUpLabel(t, today, today, dateText)?.tone).toBe('warning');
    expect(followUpLabel(t, '2026-11-02', today, dateText)?.text).toBe('enquiries.followTomorrow');
    expect(followUpLabel(t, '2026-11-09', today, dateText)?.text).toBe(
      'enquiries.followOn date=<2026-11-09>',
    );
  });

  it('offers today, tomorrow, three days and a week as follow-up days', () => {
    expect(quickFollowUps('2026-12-29').map((q) => q.date)).toEqual([
      '2026-12-29',
      '2026-12-30',
      '2027-01-01',
      '2027-01-05',
    ]);
  });

  it('works out the conversion and colours each stage', () => {
    expect(conversion(3, 12)).toBe(25);
    expect(conversion(0, 0)).toBeNull();
    expect(stageTone('joined')).toBe('success');
    expect(stageTone('follow_up')).toBe('warning');
  });

  it('writes the first WhatsApp to the family', () => {
    expect(
      welcomeMessage(t, {
        institute: 'Vidya',
        parent: 'Mrs Lakshmi',
        child: 'Kavya',
        interest: 'Maths',
      }).split('\n'),
    ).toEqual([
      'enquiries.msg.helloName name=Mrs Lakshmi',
      'enquiries.msg.thanksFor institute=Vidya child=Kavya interest=Maths',
      'enquiries.msg.invite',
    ]);
    expect(
      welcomeMessage(t, { institute: 'Vidya', parent: '', child: 'Kavya', interest: '' }),
    ).toContain('enquiries.msg.hello\nenquiries.msg.thanks institute=Vidya child=Kavya');
  });
});
