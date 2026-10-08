import { LINK_DAYS, linkMessage } from '../logic';

const v = {
  parent: 'Mr Rao',
  student: 'Asha',
  institute: 'Bright',
  url: 'https://x.web.app/p/tok',
};

describe('linkMessage', () => {
  it('english names the student, institute and link, and asks not to forward', () => {
    const m = linkMessage('en', v);
    expect(m).toContain('Dear Mr Rao,');
    expect(m).toContain("Asha's attendance and fees at Bright");
    expect(m).toContain(v.url);
    expect(m).toContain('do not forward');
  });
  it('hindi carries the same facts', () => {
    const m = linkMessage('hi', v);
    for (const s of ['प्रिय Mr Rao', 'Asha', 'Bright', v.url]) expect(m).toContain(s);
  });
  it('works without a parent name', () =>
    expect(linkMessage('en', { ...v, parent: '  ' }).startsWith('Hello,')).toBe(true));
});

it('offers 7, 30 and 90 days', () => expect([...LINK_DAYS]).toEqual([7, 30, 90]));
