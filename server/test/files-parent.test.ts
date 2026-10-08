import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { detectImage, isFileName } from '../src/files/store.js';
import { signToken } from '../src/lib/jwt.js';
import { hashToken } from '../src/parent/service.js';
import { testConfig } from './db.js';
import { startHarness, type Harness, type Tenant } from './helpers.js';

let h: Harness;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  h = await startHarness({ PUBLIC_BASE_URL: 'https://api.test.example' });
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  A = await h.tenant('+919876543210', { institute: 'Alpha Academy' });
  B = await h.tenant('+919123456789', { institute: 'Beta' });
});

const TODAY = '2026-10-08';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('fake-but-valid-header-bytes'),
]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jfif-bytes-here')]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([1, 2, 3, 4]),
  Buffer.from('WEBPVP8 data'),
]);
const batch = (over = {}) => ({
  name: 'Maths 10',
  subject: 'Maths',
  class: '10',
  days: ['thu'],
  startTime: '17:00',
  endTime: '18:00',
  defaultFee: 150000,
  ...over,
});
const student = (over = {}) => ({
  name: 'Asha Rao',
  parentName: 'Mr Rao',
  parentPhone: '9876500001',
  monthlyFee: 100000,
  notes: 'private note about Asha',
  ...over,
});
const mk = async (t: Tenant, path: string, body: unknown) => {
  const r = await t.call('POST', path, body);
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
};
const put = (t: Tenant, url: string, body: Buffer | string, type = 'image/png') =>
  h.app.inject({
    method: 'PUT',
    url,
    headers: { authorization: `Bearer ${t.token}`, 'content-type': type },
    payload: body,
  });
const get = (url: string, t?: Tenant) =>
  h.app.inject({
    method: 'GET',
    url,
    ...(t ? { headers: { authorization: `Bearer ${t.token}` } } : {}),
  });
const files = async (kind: string) =>
  fs.readdir(path.join(h.filesDir, kind)).catch(() => [] as string[]);

describe('image detection', () => {
  it('knows PNG, JPEG and WebP by their bytes, and nothing else', () => {
    expect([detectImage(PNG), detectImage(JPG), detectImage(WEBP)]).toEqual(['png', 'jpg', 'webp']);
    expect(
      detectImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ),
    ).toBeNull();
    expect(detectImage(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(detectImage(Buffer.from('GIF89a......'))).toBeNull();
    expect(detectImage(Buffer.from('%PDF-1.7 .....'))).toBeNull();
    expect(detectImage(Buffer.alloc(0))).toBeNull();
    expect(detectImage(Buffer.from('RIFF....WAVEfmt '))).toBeNull();
  });
  it('only names we generate are accepted as file names', () => {
    expect(isFileName('0123456789abcdef0123456789abcdef.png')).toBe(true);
    for (const bad of [
      '../etc/passwd',
      '..%2f',
      'a.png',
      '0123456789ABCDEF0123456789ABCDEF.png',
      '0123456789abcdef0123456789abcdef.svg',
      '0123456789abcdef0123456789abcdef.png/..',
      '',
      null,
      5,
    ])
      expect(isFileName(bad)).toBe(false);
  });
});

describe('institute logo', () => {
  it('owner uploads; the logo is public at a random name; /institute shows it', async () => {
    const r = await put(A, '/institute/logo', PNG);
    expect(r.statusCode).toBe(200);
    const url = r.json().logoUrl as string;
    expect(url).toMatch(/^https:\/\/api\.test\.example\/files\/logos\/[a-f0-9]{32}\.png$/);
    const res = await get(new URL(url).pathname); // no sign-in needed
    expect([
      res.statusCode,
      res.headers['content-type'],
      res.headers['x-content-type-options'],
    ]).toEqual([200, 'image/png', 'nosniff']);
    expect(res.rawPayload.equals(PNG)).toBe(true);
    expect((await A.call('GET', '/institute')).body.logoUrl).toBe(url);
    expect((await B.call('GET', '/institute')).body.logoUrl).toBeNull();
  });

  it('replacing deletes the old file; removing deletes it too', async () => {
    await put(A, '/institute/logo', PNG);
    expect(await files('logos')).toHaveLength(1);
    await put(A, '/institute/logo', JPG, 'image/jpeg');
    const left = await files('logos');
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/\.jpg$/);
    expect((await A.call('DELETE', '/institute/logo')).status).toBe(200);
    expect(await files('logos')).toHaveLength(0);
    expect((await A.call('GET', '/institute')).body.logoUrl).toBeNull();
  });

  it('refuses anything that is not really a PNG/JPEG/WebP, whatever the client claims', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    expect((await put(A, '/institute/logo', html, 'image/png')).statusCode).toBe(415); // lies about its type
    expect((await put(A, '/institute/logo', html, 'text/html')).statusCode).toBe(415);
    expect((await put(A, '/institute/logo', '<svg/>', 'image/svg+xml')).statusCode).toBe(415);
    expect(
      (await put(A, '/institute/logo', Buffer.alloc(0), 'image/png')).statusCode,
    ).toBeGreaterThanOrEqual(400);
    expect((await put(A, '/institute/logo', JPG, 'image/png')).statusCode).toBe(200); // real picture, wrong label: the bytes decide
    expect(await files('logos')).toHaveLength(1);
  });

  it('refuses a picture over 2 MB', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await put(A, '/institute/logo', big)).statusCode).toBe(413);
    expect(await files('logos')).toHaveLength(0);
  });

  it('staff, strangers and an expired plan cannot change it', async () => {
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    expect((await put(staff, '/institute/logo', PNG)).statusCode).toBe(403);
    expect(
      (
        await h.app.inject({
          method: 'PUT',
          url: '/institute/logo',
          headers: { 'content-type': 'image/png' },
          payload: PNG,
        })
      ).statusCode,
    ).toBe(401);
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000);
    const token = signToken(
      A.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const r = await h.app.inject({
      method: 'PUT',
      url: '/institute/logo',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(r.statusCode).toBe(402);
    expect(await files('logos')).toHaveLength(0);
  });

  it('bad or hostile file names are plain 404s', async () => {
    await put(A, '/institute/logo', PNG);
    for (const n of [
      '../../../etc/passwd',
      '..%2F..%2Fetc%2Fpasswd',
      'x.png',
      '0123456789abcdef0123456789abcdef.png',
      '%00',
      'A'.repeat(90),
    ]) {
      const r = await get(`/files/logos/${n}`);
      expect([n, r.statusCode]).toEqual([n, 404]);
    }
  });
});

describe('student photos are private', () => {
  it('owner uploads and any member of that institute can read it', async () => {
    const s = await mk(A, '/students', student());
    const r = await put(A, `/students/${s}/photo`, JPG, 'image/jpeg');
    expect(r.json()).toEqual({ photoUrl: `/students/${s}/photo` });
    expect((await A.call('GET', `/students/${s}`)).body.photoUrl).toBe(`/students/${s}/photo`);
    const res = await get(`/students/${s}/photo`, A);
    expect([res.statusCode, res.headers['content-type'], res.headers['cache-control']]).toEqual([
      200,
      'image/jpeg',
      'private, max-age=300',
    ]);
    expect(res.rawPayload.equals(JPG)).toBe(true);
  });

  it('nobody outside the institute can read, replace or remove it', async () => {
    const s = await mk(A, '/students', student());
    await put(A, `/students/${s}/photo`, PNG);
    expect((await get(`/students/${s}/photo`)).statusCode).toBe(401);
    expect((await get(`/students/${s}/photo`, B)).statusCode).toBe(404);
    expect((await put(B, `/students/${s}/photo`, JPG, 'image/jpeg')).statusCode).toBe(404);
    expect((await B.call('DELETE', `/students/${s}/photo`)).status).toBe(404);
    expect((await get(`/students/${s}/photo`, A)).rawPayload.equals(PNG)).toBe(true); // untouched
  });

  it('replace and delete clean up the disk; no photo is a 404', async () => {
    const s = await mk(A, '/students', student());
    expect((await get(`/students/${s}/photo`, A)).statusCode).toBe(404);
    await put(A, `/students/${s}/photo`, PNG);
    await put(A, `/students/${s}/photo`, WEBP, 'image/webp');
    expect(await files('photos')).toHaveLength(1);
    await A.call('DELETE', `/students/${s}/photo`);
    expect(await files('photos')).toHaveLength(0);
    expect((await A.call('GET', `/students/${s}`)).body.photoUrl).toBeNull();
  });

  it('staff can see photos but not change them; a bad id is a 400', async () => {
    const s = await mk(A, '/students', student());
    await put(A, `/students/${s}/photo`, PNG);
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    expect((await get(`/students/${s}/photo`, staff)).statusCode).toBe(200);
    expect((await put(staff, `/students/${s}/photo`, PNG)).statusCode).toBe(403);
    expect((await get('/students/not-a-uuid/photo', A)).statusCode).toBe(400);
  });
});

describe('parent links and the parent view', () => {
  let b: string;
  let s: string;
  const view = (token: unknown) =>
    h.app.inject({ method: 'POST', url: '/api/parent', payload: { token } });
  const newLink = async (t = A, studentId = s, body: object = {}) =>
    t.call('POST', `/students/${studentId}/parent-link`, body);
  beforeEach(async () => {
    b = await mk(A, '/batches', batch());
    s = await mk(A, '/students', student({ batchIds: [b] }));
  });

  it('creates a private link that opens a read-only view of that one student', async () => {
    const r = await newLink();
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.body.url).toBe(`https://api.test.example/p/${r.body.token}`);
    expect(r.body.expiresAt).toBe('2026-11-07T06:00:00.000Z'); // default 30 days
    const res = await view(r.body.token);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({
      institute: { name: 'Alpha Academy', logoUrl: null },
      student: { name: 'Asha Rao', className: '' },
      attendance: { pct: null, days: [] },
      fees: { outstanding: 0, items: [] },
      payments: [],
    });
  });

  it('shows attendance (30 days, no holidays), fees and receipts; hides waived balances and reversed payments', async () => {
    await A.call('PUT', '/attendance', { batchId: b, date: '2026-10-08', marks: { [s]: 'P' } });
    await A.call('PUT', '/attendance', { batchId: b, date: '2026-10-07', marks: { [s]: 'A' } });
    await A.call('PUT', '/attendance', { batchId: b, date: '2026-10-06', marks: { [s]: 'L' } });
    await A.call('PUT', '/attendance', {
      batchId: b,
      date: '2026-10-05',
      holiday: 'holiday',
      marks: {},
    });
    await A.call('PUT', '/attendance', { batchId: b, date: '2026-09-07', marks: { [s]: 'A' } }); // 31 days ago: outside
    await A.call('POST', '/fees/generate', {});
    const due = (await A.call('GET', `/fees/dues?studentId=${s}`)).body.dues[0].id as string;
    const p1 = await A.call('POST', `/fees/dues/${due}/payments`, { amount: 30000, mode: 'cash' });
    const p2 = await A.call('POST', `/fees/dues/${due}/payments`, { amount: 10000, mode: 'upi' });
    await A.call('POST', `/fees/payments/${p2.body.paymentId}/reverse`);
    const v = (await view((await newLink()).body.token)).json();
    expect(v.attendance).toMatchObject({ pct: 66.7, present: 1, late: 1, absent: 1 });
    expect(v.attendance.days).toEqual([
      { date: '2026-10-08', mark: 'P' },
      { date: '2026-10-07', mark: 'A' },
      { date: '2026-10-06', mark: 'L' },
    ]);
    expect(v.fees).toMatchObject({
      outstanding: 70000,
      items: [
        {
          description: 'Monthly fee',
          net: 100000,
          paid: 30000,
          outstanding: 70000,
          status: 'partial',
        },
      ],
    });
    expect(v.payments).toEqual([
      { receiptNo: 'TD-00001', amount: 30000, date: TODAY, mode: 'cash' },
    ]); // the reversed one is hidden
    expect(p1.status).toBe(201);
    await A.call('POST', `/fees/dues/${due}/waive`, { waived: true });
    expect((await view((await newLink()).body.token)).json().fees.outstanding).toBe(0);
  });

  it('never exposes phone numbers, notes, other students or ids', async () => {
    await mk(
      A,
      '/students',
      student({ name: 'Other Kid', parentPhone: '9876500002', notes: 'secret about other kid' }),
    );
    const text = (await view((await newLink()).body.token)).body;
    for (const forbidden of [
      '9876500001',
      '9876500002',
      'private note',
      'secret about',
      'Other Kid',
      'Mr Rao',
      A.instituteId,
      s,
      'parentPhone',
      'notes',
    ])
      expect(text, forbidden).not.toContain(forbidden);
  });

  it('every failure is the identical 404: unknown, malformed, expired, switched off, missing', async () => {
    const good = (await newLink()).body.token as string;
    const expired = (await newLink(A, s, { days: 1 })).body.token as string;
    const revoked = (await newLink()).body.token as string;
    await h.db.pool.query('UPDATE parent_links SET revoked = 1 WHERE token_hash = ?', [
      hashToken(revoked),
    ]);
    h.clock.now = new Date(h.clock.now.getTime() + 2 * 86_400_000);
    const unknown = 'A'.repeat(43);
    const answers = await Promise.all(
      [
        unknown,
        'short',
        '',
        expired,
        revoked,
        `${good}x`,
        good.toLowerCase() === good ? good.toUpperCase() : good.toLowerCase(),
        null,
        5,
        { a: 1 },
      ].map(async (t) => {
        const r = await view(t);
        return [r.statusCode, r.body, r.headers['cache-control']];
      }),
    );
    for (const a of answers) expect(a).toEqual([404, '{"error":"not_found"}', 'no-store']);
    expect(
      (await h.app.inject({ method: 'POST', url: '/api/parent', payload: {} })).statusCode,
    ).toBe(404);
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: '/api/parent',
          headers: { 'content-type': 'application/json' },
          payload: '{bad',
        })
      ).statusCode,
    ).toBeLessThan(500);
    expect((await view(good)).statusCode).toBe(200);
  });

  it('only the hash of the token is stored', async () => {
    const t = (await newLink()).body.token as string;
    const [rows] = (await h.db.pool.query('SELECT * FROM parent_links')) as unknown as [
      Record<string, unknown>[],
    ];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(hashToken(t));
    expect(JSON.stringify(rows)).not.toContain(t);
  });

  it("each link is for one student; two links work independently; revoking switches off all of that student's links", async () => {
    const s2 = await mk(A, '/students', student({ name: 'Bala K', parentPhone: '9876500002' }));
    const l1 = (await newLink()).body.token as string;
    const l2 = (await newLink()).body.token as string;
    const l3 = (await newLink(A, s2)).body.token as string;
    expect((await view(l1)).json().student.name).toBe('Asha Rao');
    expect((await view(l3)).json().student.name).toBe('Bala K');
    expect((await A.call('GET', `/students/${s}/parent-link`)).body).toMatchObject({ active: 2 });
    expect((await A.call('DELETE', `/students/${s}/parent-link`)).body).toEqual({ revoked: 2 });
    expect([
      (await view(l1)).statusCode,
      (await view(l2)).statusCode,
      (await view(l3)).statusCode,
    ]).toEqual([404, 404, 200]);
    expect((await A.call('GET', `/students/${s}/parent-link`)).body).toEqual({
      active: 0,
      latestExpiresAt: null,
    });
  });

  it('validity can be set from 1 to 90 days, never more', async () => {
    expect((await newLink(A, s, { days: 90 })).status).toBe(201);
    expect((await newLink(A, s, { days: 1 })).body.expiresAt).toBe('2026-10-09T06:00:00.000Z');
    for (const days of [0, 91, -1, 1.5, '7'])
      expect((await newLink(A, s, { days })).status).toBe(400);
  });

  it("B cannot create, see or revoke links for A's student", async () => {
    const t = (await newLink()).body.token as string;
    expect((await B.call('POST', `/students/${s}/parent-link`, {})).status).toBe(404);
    expect((await B.call('GET', `/students/${s}/parent-link`)).status).toBe(404);
    expect((await B.call('DELETE', `/students/${s}/parent-link`)).status).toBe(404);
    expect((await view(t)).statusCode).toBe(200); // A's link is untouched
  });

  it('staff can check link status but not create or revoke; an expired plan cannot create', async () => {
    const staff = await h.tenant('+919000011111');
    await h.db.pool.query('DELETE FROM memberships WHERE user_id = ?', [staff.userId]);
    await h.db.pool.query(
      "INSERT INTO memberships (user_id, institute_id, role) VALUES (?, ?, 'staff')",
      [staff.userId, A.instituteId],
    );
    expect((await staff.call('GET', `/students/${s}/parent-link`)).status).toBe(200);
    expect((await staff.call('POST', `/students/${s}/parent-link`, {})).status).toBe(403);
    expect((await staff.call('DELETE', `/students/${s}/parent-link`)).status).toBe(403);
    const t = (await newLink()).body.token as string;
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 86_400_000); // plan ended, link (30 days) still valid
    const token = signToken(
      A.userId,
      'test-jwt-secret-test-jwt-secret-1234',
      900,
      h.clock.now.getTime(),
    );
    const r = await h.app.inject({
      method: 'POST',
      url: `/students/${s}/parent-link`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(r.statusCode).toBe(402);
    expect((await view(t)).statusCode).toBe(200); // parents keep seeing what they were already given
  });

  it('shows the logo when there is one', async () => {
    await put(A, '/institute/logo', PNG);
    const v = (await view((await newLink()).body.token)).json();
    expect(v.institute.logoUrl).toMatch(
      /^https:\/\/api\.test\.example\/files\/logos\/[a-f0-9]{32}\.png$/,
    );
  });

  it('serves the page and its files with a strict content-security policy and no caching of the page', async () => {
    const t = (await newLink()).body.token as string;
    const page = await get(`/p/${t}`);
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.headers['content-security-policy']).toBe(
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    expect([
      page.headers['cache-control'],
      page.headers['referrer-policy'],
      page.headers['x-robots-tag'],
    ]).toEqual(['no-store', 'no-referrer', 'noindex, nofollow']);
    expect(page.body).toContain('/parent.js');
    expect(page.body).not.toMatch(/<script>[^<]/); // no inline script
    for (const [url, type] of [
      ['/parent.js', 'javascript'],
      ['/parent.css', 'text/css'],
      ['/', 'text/html'],
    ] as const) {
      const r = await get(url);
      expect([
        url,
        r.statusCode,
        r.headers['content-type']!.includes(type),
        !!r.headers['content-security-policy'],
      ]).toEqual([url, 200, true, true]);
    }
    expect((await get('/p/garbage')).statusCode).toBe(200); // the page itself says "this link is not valid"
    expect((await get('/parent.js')).body).toContain('/api/parent');
  });

  it('rate-limits guessing (60 a minute from one address)', async () => {
    // a fresh app, so earlier tests in this file have not used up the allowance
    const fresh = await buildApp({
      config: testConfig({ ...h.db.config, FILES_DIR: h.filesDir }),
      pool: h.db.pool,
      clock: () => h.clock.now,
    });
    const codes: number[] = [];
    for (let i = 0; i < 70; i++)
      codes.push(
        (
          await fresh.inject({
            method: 'POST',
            url: '/api/parent',
            payload: { token: 'A'.repeat(43) },
          })
        ).statusCode,
      );
    await fresh.close();
    expect(codes.slice(0, 60).every((c) => c === 404)).toBe(true);
    expect(codes.slice(60).every((c) => c === 429)).toBe(true);
  });
});
