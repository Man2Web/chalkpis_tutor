import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ASK_AGAIN_DAYS,
  detailsSchema,
  filterStates,
  HEARD_FROM,
  laterUntil,
  shouldAsk,
  STATES,
  toPayload,
} from '../ownerDetails';

const good = {
  email: '  Kiran@Example.com ',
  city: 'Vellore',
  state: 'Tamil Nadu',
  pincode: '632001',
  heardFrom: 'instagram',
  heardFromOther: '',
};
const errors = (v: object) =>
  detailsSchema.safeParse(v).error?.issues.map((i) => [i.path[0], i.message]) ?? [];

describe('detailsSchema', () => {
  it('accepts a full answer, tidying the email', () => {
    const r = detailsSchema.parse(good);
    expect(r.email).toBe('kiran@example.com');
  });

  it('names each wrong field with its message', () => {
    expect(errors({ ...good, email: 'kiran@' })).toEqual([['email', 'email']]);
    expect(errors({ ...good, city: ' ' })).toEqual([['city', 'required']]);
    expect(errors({ ...good, state: 'Madras' })).toEqual([['state', 'state']]);
    expect(errors({ ...good, heardFrom: undefined })).toEqual([['heardFrom', 'heardFrom']]);
  });

  it('wants a six-digit PIN code that does not start with 0', () => {
    for (const pincode of ['63200', '6320011', '032001', '63 001', 'abcdef'])
      expect(errors({ ...good, pincode })).toEqual([['pincode', 'pincode']]);
  });

  it('asks where, only when the answer is Other', () => {
    expect(errors({ ...good, heardFrom: 'other' })).toEqual([['heardFromOther', 'heardFromOther']]);
    expect(errors({ ...good, heardFrom: 'other', heardFromOther: 'A poster' })).toEqual([]);
  });

  it('sends the Other text only with Other', () => {
    const d = detailsSchema.parse({ ...good, heardFromOther: 'left over' });
    expect(toPayload(d).heardFromOther).toBe('');
  });
});

describe('filterStates', () => {
  it('lists every state and union territory, and finds by any part of the name', () => {
    expect(filterStates('')).toHaveLength(36);
    expect(filterStates(' nadu')).toEqual(['Tamil Nadu']);
    expect(filterStates('PRADESH')).toContain('Uttar Pradesh');
  });
});

describe('shouldAsk', () => {
  const now = Date.parse('2026-11-04T10:00:00Z');
  it('asks an owner whose details are missing', () => {
    expect(shouldAsk({ role: 'owner', detailsDone: false, laterUntil: null, now })).toBe(true);
  });
  it('never asks a helper, an owner who answered, or when an older server does not say', () => {
    expect(shouldAsk({ role: 'staff', detailsDone: false, laterUntil: null, now })).toBe(false);
    expect(shouldAsk({ role: 'owner', detailsDone: true, laterUntil: null, now })).toBe(false);
    expect(shouldAsk({ role: 'owner', detailsDone: undefined, laterUntil: null, now })).toBe(false);
  });
  it(`waits ${ASK_AGAIN_DAYS} days after Later`, () => {
    const until = laterUntil(now);
    expect(shouldAsk({ role: 'owner', detailsDone: false, laterUntil: until, now })).toBe(false);
    expect(
      shouldAsk({ role: 'owner', detailsDone: false, laterUntil: until, now: until - 1 }),
    ).toBe(false);
    expect(shouldAsk({ role: 'owner', detailsDone: false, laterUntil: until, now: until })).toBe(
      true,
    );
  });
});

// The server checks the same lists; a value only one side knows would be refused or never offered.
const server = path.join(__dirname, '../../../../../server/src/institutes/details.ts');
(existsSync(server) ? it : it.skip)('offers exactly the answers the server accepts', () => {
  const src = readFileSync(server, 'utf8');
  const list = (name: string) => {
    const body = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(src)![1]!;
    return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };
  expect(list('HEARD_FROM')).toEqual([...HEARD_FROM]);
  expect(list('STATES')).toEqual([...STATES]);
});
