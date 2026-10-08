import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { DEMO_PHONE, DEMO_UID, seedInstitute } from './seed';

// `npm run seed` (from the repo root). Refuses to run unless an emulator is configured.
void (async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error(
      'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. This script only fills the local emulators.',
    );
    process.exit(1);
  }
  if (!getApps().length)
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-tutordesk' });
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    try {
      await getAuth().createUser({ uid: DEMO_UID, phoneNumber: DEMO_PHONE });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/uid-already-exists' && code !== 'auth/phone-number-already-exists')
        throw e;
    }
  }
  const s = await seedInstitute(getFirestore());
  if (!s.created) {
    console.log(`Already seeded (institute ${s.instituteId}). Stop the emulators to start fresh.`);
  } else {
    console.log(
      `Seeded institute ${s.instituteId}: ${s.batches} batches, ${s.students} students, ${s.attendanceDays} attendance days, ${s.dues} dues, ${s.payments} payments.\nLog in with phone 9999900001 (the code screen shows the test code).`,
    );
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
