/**
 * Load test: starts the real server on a throwaway database, loads one busy institute and hammers it over real HTTP
 * with a realistic mix. Run with the local database up:  npm run db:start && npx tsx scripts/loadtest.ts [seconds] [concurrency]
 * Numbers from a laptop are NOT the VPS's numbers: use them to compare before/after a change and to spot errors.
 */
import { startHarness } from '../test/helpers.js';

const SECONDS = Number(process.argv[2] ?? 20);
const CONCURRENCY = Number(process.argv[3] ?? 40);
const STUDENTS = 300;
const BATCHES = 10;

const h = await startHarness({ DB_POOL_SIZE: 10 });
await h.reset();
h.clock.now = new Date(); // a real test uses the real clock (the harness clock is fixed for unit tests)
const t = await h.tenant('+919876543210', { institute: 'Load Test Academy' });
await h.db.pool.query(
  "UPDATE subscriptions SET plan = 'pro', student_limit = NULL, batch_limit = NULL, expires_at = ?",
  [new Date(Date.now() + 365 * 86_400_000)],
);
await h.app.listen({ port: 0, host: '127.0.0.1' });
const base = `http://127.0.0.1:${(h.app.server.address() as { port: number }).port}`;

const api = async (method: string, url: string, body?: unknown) => {
  const r = await fetch(base + url, {
    method,
    headers: {
      authorization: `Bearer ${t.token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: r.headers.get('content-type')?.includes('json') ? await r.json() : null,
  };
};

console.log(`seeding ${STUDENTS} students, ${BATCHES} batches, 60 days of attendance...`);
const batchIds: string[] = [];
for (let i = 0; i < BATCHES; i++)
  batchIds.push(
    (
      await api('POST', '/batches', {
        name: `Batch ${i}`,
        subject: 'Maths',
        class: '10',
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
        startTime: '17:00',
        endTime: '18:00',
        defaultFee: 100000,
      })
    ).body.id,
  );
const bulk = await api('POST', '/students/bulk', {
  students: Array.from({ length: STUDENTS }, (_, i) => ({
    name: `Student ${i}`,
    parentName: `Parent ${i}`,
    parentPhone: `9${String(800000000 + i).padStart(9, '0')}`,
    monthlyFee: 100000,
    dueDay: 1 + (i % 28),
    batchIds: [batchIds[i % BATCHES]],
  })),
});
if (bulk.status !== 201)
  throw new Error(`seeding students failed: ${bulk.status} ${JSON.stringify(bulk.body)}`);
const students = bulk.body.ids as string[];
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayMinus = (n: number) =>
  new Date(new Date(`${today}T00:00:00Z`).getTime() - n * 86_400_000).toISOString().slice(0, 10);
for (let d = 1; d <= 60; d++)
  for (let b = 0; b < BATCHES; b++) {
    const marks = Object.fromEntries(
      students.filter((_, i) => i % BATCHES === b).map((s, i) => [s, i % 7 === 0 ? 'A' : 'P']),
    );
    await api('PUT', '/attendance', { batchId: batchIds[b], date: dayMinus(d), marks });
  }
await api('POST', '/fees/generate', {});
const dues = (await api('GET', '/fees/dues?limit=500')).body.dues as { id: string }[];
console.log(`seeded: ${students.length} students, ${dues.length} open dues`);

type Op = { name: string; weight: number; run: () => Promise<{ status: number }> };
let payIdx = 0;
const ops: Op[] = [
  { name: 'GET /dashboard', weight: 20, run: () => api('GET', '/dashboard') },
  { name: 'GET /students (200)', weight: 20, run: () => api('GET', '/students?limit=200') },
  { name: 'GET /fees/overview', weight: 15, run: () => api('GET', '/fees/overview') },
  { name: 'GET /fees/dues', weight: 10, run: () => api('GET', '/fees/dues?limit=200') },
  {
    name: 'GET /attendance/report (30d)',
    weight: 10,
    run: () => api('GET', `/attendance/report?from=${dayMinus(30)}&to=${today}`),
  },
  {
    name: 'PUT /attendance (30 marks)',
    weight: 15,
    run: () => {
      const b = Math.floor(Math.random() * BATCHES);
      return api('PUT', '/attendance', {
        batchId: batchIds[b],
        date: today,
        marks: Object.fromEntries(
          students
            .filter((_, i) => i % BATCHES === b)
            .map((s) => [s, Math.random() < 0.2 ? 'A' : 'P']),
        ),
      });
    },
  },
  {
    name: 'POST payment',
    weight: 10,
    run: () =>
      api('POST', `/fees/dues/${dues[payIdx++ % dues.length]!.id}/payments`, {
        amount: 100,
        mode: 'cash',
      }),
  },
];
const bag = ops.flatMap((o) => Array(o.weight).fill(o) as Op[]);
const lat = new Map<string, number[]>();
const statuses = new Map<string, number>();
const end = Date.now() + SECONDS * 1000;
console.log(`running ${CONCURRENCY} concurrent clients for ${SECONDS}s...`);
const started = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (Date.now() < end) {
      const op = bag[Math.floor(Math.random() * bag.length)]!;
      const t0 = performance.now();
      let status = 0;
      try {
        status = (await op.run()).status;
      } catch {
        status = -1;
      }
      const ms = performance.now() - t0;
      (lat.get(op.name) ?? lat.set(op.name, []).get(op.name)!).push(ms);
      const k = `${op.name} -> ${status}`;
      statuses.set(k, (statuses.get(k) ?? 0) + 1);
    }
  }),
);
const secs = (Date.now() - started) / 1000;
const pct = (a: number[], p: number) =>
  a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))]!;
let total = 0;
console.log(
  '\noperation'.padEnd(34),
  'count'.padStart(7),
  'p50 ms'.padStart(8),
  'p95 ms'.padStart(8),
  'p99 ms'.padStart(8),
);
for (const [name, a] of lat) {
  total += a.length;
  console.log(
    name.padEnd(33),
    String(a.length).padStart(7),
    pct(a, 50).toFixed(0).padStart(8),
    pct(a, 95).toFixed(0).padStart(8),
    pct(a, 99).toFixed(0).padStart(8),
  );
}
console.log(
  `\n${total} requests in ${secs.toFixed(1)}s = ${(total / secs).toFixed(0)} requests/second`,
);
const bad = [...statuses].filter(
  ([k]) => !/-> (200|201)$/.test(k) && !/POST payment -> 409$/.test(k),
);
console.log('unexpected answers:', bad.length ? Object.fromEntries(bad) : 'none');
const [[c]] = (await h.db.pool.query(
  'SELECT (SELECT COUNT(*) FROM payments) AS pays, (SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no, 4) AS UNSIGNED)),0) FROM payments) AS maxno, (SELECT COUNT(DISTINCT receipt_no) FROM payments) AS distinct_no',
)) as unknown as [[{ pays: number; maxno: number; distinct_no: number }]];
console.log(
  `payments: ${c.pays}, highest receipt number ${c.maxno}, distinct receipt numbers ${c.distinct_no} ${Number(c.pays) === Number(c.distinct_no) && Number(c.pays) === Number(c.maxno) ? '(no gaps, no duplicates)' : '(PROBLEM)'}`,
);
await h.close();
process.exit(bad.length || Number(c.pays) !== Number(c.distinct_no) ? 1 : 0);
