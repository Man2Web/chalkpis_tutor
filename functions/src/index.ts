import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as functionsV1 from 'firebase-functions/v1';
import { deleteAccountForUser } from './lib/account';
import { currentPeriod, generateDuesForInstitute } from './lib/dues';
import { createInstituteForUser, validateCreateInput } from './lib/institute';
import { enforceBatchLimit, enforceStudentLimit } from './lib/stats';

initializeApp();
// All functions run in Mumbai (data residency + latency for Indian users).
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = () => getFirestore();

/** Daily at 02:00 IST: create this month's missing dues. Idempotent. */
export const generateFeeDues = onSchedule(
  { schedule: '0 2 * * *', timeZone: 'Asia/Kolkata' },
  async () => {
    const period = currentPeriod();
    const institutes = await db().collection('institutes').select().get();
    for (const inst of institutes.docs) {
      const sub = (await inst.ref.collection('subscription').doc('current').get()).data();
      const expired = !sub || sub.status !== 'active' || sub.expiresAt.toMillis() < Date.now();
      if (expired) continue; // read-only mode after expiry
      const n = await generateDuesForInstitute(db(), inst.id, period);
      if (n) console.log(`generateFeeDues: ${inst.id} created ${n}`);
    }
  },
);

export const onStudentWrite = onDocumentWritten(
  'institutes/{instituteId}/students/{studentId}',
  async (event) => {
    const { instituteId, studentId } = event.params;
    await enforceStudentLimit(
      db(),
      instituteId,
      studentId,
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);

export const onBatchWrite = onDocumentWritten(
  'institutes/{instituteId}/batches/{batchId}',
  async (event) => {
    const { instituteId, batchId } = event.params;
    await enforceBatchLimit(
      db(),
      instituteId,
      batchId,
      event.data?.before.data(),
      event.data?.after.data(),
    );
  },
);

/** Placeholder: onboarding creates documents through createInstitute. */
export const onAuthCreate = functionsV1
  .region('asia-south1')
  .auth.user()
  .onCreate(() => undefined);

export const createInstitute = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  let input;
  try {
    input = validateCreateInput(request.data);
  } catch (e) {
    throw new HttpsError('invalid-argument', (e as Error).message);
  }
  const phone = request.auth.token.phone_number as string | undefined;
  return createInstituteForUser(db(), request.auth.uid, phone, input);
});

export const deleteAccount = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  try {
    await deleteAccountForUser(
      {
        db: db(),
        deleteFiles: async (prefix) => {
          await getStorage().bucket().deleteFiles({ prefix });
        },
        deleteAuthUser: (uid) => getAuth().deleteUser(uid),
      },
      request.auth.uid,
    );
  } catch (e) {
    if ((e as Error).message === 'only-owner')
      throw new HttpsError('permission-denied', 'Only the owner can delete the account.');
    throw new HttpsError('internal', 'Could not delete the account.');
  }
  return { ok: true };
});
