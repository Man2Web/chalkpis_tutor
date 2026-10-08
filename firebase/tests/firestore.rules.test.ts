import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { setLogLevel } from 'firebase/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

setLogLevel('error');
let env: RulesTestEnvironment;
const future = () => Timestamp.fromMillis(Date.now() + 86_400_000);
const past = () => Timestamp.fromMillis(Date.now() - 86_400_000);

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ownerA'), { role: 'owner', instituteId: 'A' });
    await setDoc(doc(db, 'users/staffA'), { role: 'staff', instituteId: 'A' });
    await setDoc(doc(db, 'users/ownerB'), { role: 'owner', instituteId: 'B' });
    await setDoc(doc(db, 'users/ownerX'), { role: 'owner', instituteId: 'X' }); // expired plan
    for (const [id, expires] of [['A', future()], ['B', future()], ['X', past()]] as const) {
      await setDoc(doc(db, `institutes/${id}`), { ownerUid: `owner${id}`, nextReceiptNo: 1 });
      await setDoc(doc(db, `institutes/${id}/subscription/current`), { status: 'active', expiresAt: expires });
      await setDoc(doc(db, `institutes/${id}/counters/stats`), { studentCount: 0 });
      await setDoc(doc(db, `institutes/${id}/students/s1`), { name: 'Asha', status: 'active' });
      await setDoc(doc(db, `institutes/${id}/payments/p1`), { amount: 1000 });
      await setDoc(doc(db, `institutes/${id}/feeDues/d1`), { paid: 0 });
    }
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'tutordesk-rules-test',
    firestore: { rules: readFileSync(join(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('tenant isolation', () => {
  it('owner reads own institute data', async () => {
    await assertSucceeds(getDoc(doc(as('ownerA'), 'institutes/A/students/s1')));
  });
  it('owner cannot read or write another institute', async () => {
    const db = as('ownerA');
    await assertFails(getDoc(doc(db, 'institutes/B/students/s1')));
    await assertFails(setDoc(doc(db, 'institutes/B/students/s2'), { name: 'Evil' }));
    await assertFails(getDoc(doc(db, 'institutes/B/payments/p1')));
  });
  it('signed-out users get nothing', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'institutes/A/students/s1')));
  });
  it('new user cannot create a user doc pointing at someone else institute', async () => {
    const db = env.authenticatedContext('newbie').firestore();
    await assertFails(setDoc(doc(db, 'users/newbie'), { role: 'owner', instituteId: 'A' }));
    await assertSucceeds(setDoc(doc(db, 'users/newbie'), { role: 'owner', name: 'N' }));
  });
  it('clients cannot create institutes', async () => {
    await assertFails(setDoc(doc(as('ownerA'), 'institutes/NEW'), { ownerUid: 'ownerA' }));
  });
  it('parentLinks are closed to clients', async () => {
    await assertFails(getDoc(doc(as('ownerA'), 'parentLinks/abc')));
  });
});

describe('role escalation', () => {
  it('user cannot change own role or institute', async () => {
    const db = as('staffA');
    await assertFails(updateDoc(doc(db, 'users/staffA'), { role: 'owner' }));
    await assertFails(updateDoc(doc(db, 'users/staffA'), { instituteId: 'B' }));
    await assertSucceeds(updateDoc(doc(db, 'users/staffA'), { language: 'hi' }));
  });
  it('staff cannot touch fees, students or payments', async () => {
    const db = as('staffA');
    await assertFails(getDoc(doc(db, 'institutes/A/payments/p1')));
    await assertFails(setDoc(doc(db, 'institutes/A/students/s9'), { name: 'x' }));
    await assertFails(setDoc(doc(db, 'institutes/A/feeDues/d9'), { paid: 0 }));
  });
  it('staff can mark attendance', async () => {
    await assertSucceeds(setDoc(doc(as('staffA'), 'institutes/A/attendance/b1_20260101'), { batchId: 'b1', marks: {} }));
  });
  it('owner cannot change ownerUid', async () => {
    await assertFails(updateDoc(doc(as('ownerA'), 'institutes/A'), { ownerUid: 'someoneElse' }));
    await assertSucceeds(updateDoc(doc(as('ownerA'), 'institutes/A'), { nextReceiptNo: 2 }));
  });
});

describe('server-owned documents', () => {
  it('subscription and counters are read-only for clients', async () => {
    const db = as('ownerA');
    await assertSucceeds(getDoc(doc(db, 'institutes/A/subscription/current')));
    await assertFails(updateDoc(doc(db, 'institutes/A/subscription/current'), { status: 'active', expiresAt: future() }));
    await assertFails(updateDoc(doc(db, 'institutes/A/counters/stats'), { studentCount: 0 }));
  });
  it('messages are read-only', async () => {
    await assertFails(addDoc(collection(as('ownerA'), 'institutes/A/messages'), { status: 'sent' }));
  });
});

describe('expired plan is read-only', () => {
  it('reads still work, writes fail', async () => {
    const db = as('ownerX');
    await assertSucceeds(getDoc(doc(db, 'institutes/X/students/s1')));
    await assertFails(setDoc(doc(db, 'institutes/X/students/s2'), { name: 'n' }));
    await assertFails(updateDoc(doc(db, 'institutes/X/students/s1'), { name: 'n' }));
    await assertFails(addDoc(collection(db, 'institutes/X/payments'), { amount: 500 }));
    await assertFails(setDoc(doc(db, 'institutes/X/attendance/b1_20260101'), { marks: {} }));
  });
  it('active plan can write', async () => {
    await assertSucceeds(setDoc(doc(as('ownerA'), 'institutes/A/students/s2'), { name: 'n', status: 'active' }));
  });
});

describe('payments are append-only', () => {
  it('create ok, update and delete denied', async () => {
    const db = as('ownerA');
    await assertSucceeds(addDoc(collection(db, 'institutes/A/payments'), { amount: 1000 }));
    await assertSucceeds(addDoc(collection(db, 'institutes/A/payments'), { amount: -1000 })); // reversing entry
    await assertFails(updateDoc(doc(db, 'institutes/A/payments/p1'), { amount: 1 }));
    await assertFails(deleteDoc(doc(db, 'institutes/A/payments/p1')));
  });
  it('rejects zero or non-integer amounts', async () => {
    const db = as('ownerA');
    await assertFails(addDoc(collection(db, 'institutes/A/payments'), { amount: 0 }));
    await assertFails(addDoc(collection(db, 'institutes/A/payments'), { amount: 10.5 }));
  });
});

describe('no hard deletes', () => {
  it('students and batches cannot be deleted', async () => {
    await assertFails(deleteDoc(doc(as('ownerA'), 'institutes/A/students/s1')));
  });
});
